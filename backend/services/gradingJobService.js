const pool = require('../config/database');
const cache = require('../utils/cacheService');
const { isBullmqEnabled } = require('../utils/bullmqGradingConfig');
const { enqueueJob, enqueueJobItems, removeQueuedItemJobs } = require('../utils/gradingJobQueue');
const { pushJobProgressById, notifyJobTerminal } = require('../utils/gradingJobNotify');
const { refreshJobAggregates } = require('../utils/gradingJobAggregator');
const {
  teacherOwnsSubmissionTask,
  teacherOwnsTaskForGrading,
} = require('../utils/accessControl');
const { assertSubmissionCodeRunReadyForGrading } = require('../utils/codeRunWorkText');
const { assertSubmissionSafeForAiGrading } = require('../services/contentSafetyService');
const { resolveSelectedSubmissions, loadSubmissionEligibilityRow, assertNewAiGradeAllowed } = require('../utils/submissionAiBatchEligibility');

function toNum(v) {
  if (v == null) return null;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function makeLegacyBatchId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function normalizeBatchMode(raw) {
  const m = String(raw || 'new_only').toLowerCase();
  if (m === 'include_failed' || m === 'regrade_all' || m === 'selected' || m === 'retry_failed' || m === 'force_regrade') {
    return m;
  }
  return 'new_only';
}

async function findActiveJobForSubmission(submissionId) {
  const [rows] = await pool.query(
    `
    SELECT j.id AS job_id
    FROM grading_job_items i
    INNER JOIN grading_jobs j ON j.id = i.job_id
    WHERE i.submission_id = ?
      AND i.status IN ('pending', 'queued', 'running')
      AND j.status IN ('pending', 'running')
    ORDER BY j.id DESC
    LIMIT 1
  `,
    [submissionId]
  );
  return rows[0]?.job_id ?? null;
}

async function loadSubmissionContext(submissionId) {
  const [rows] = await pool.query(
    `
    SELECT s.id AS submission_id, s.student_id, s.task_id,
           t.title AS task_title, t.class_id, t.teaching_class_id, t.course_id
    FROM submissions s
    INNER JOIN tasks t ON t.id = s.task_id
    WHERE s.id = ?
  `,
    [submissionId]
  );
  return rows[0] || null;
}

async function markSubmissionAiGrading(submissionId, legacyBatchId = null) {
  const [stRows] = await pool.query(
    'SELECT id FROM grading_results WHERE submission_id = ? LIMIT 1',
    [submissionId]
  );
  if (stRows.length) {
    await pool.query(
      `UPDATE grading_results SET status = 'ai_grading', ai_batch_id = ?, graded_at = NOW() WHERE submission_id = ?`,
      [legacyBatchId, submissionId]
    );
  } else {
    await pool.query(
      `INSERT INTO grading_results (submission_id, status, ai_batch_id) VALUES (?, 'ai_grading', ?)`,
      [submissionId, legacyBatchId]
    );
  }
}

async function invalidateGradingCache(submissionId) {
  try {
    const [trow] = await pool.query(
      `SELECT t.id AS task_id, t.created_by FROM submissions s JOIN tasks t ON s.task_id = t.id WHERE s.id = ?`,
      [submissionId]
    );
    if (trow.length) {
      await cache.invalidateAfterGrading(trow[0].task_id, trow[0].created_by);
    }
  } catch {
    /* ignore */
  }
}

function emitSubmissionQueued(_meta) {
  /* 批改任务进度改由 grading_job Socket 推送，不再依赖 class 房间 */
}

async function loadBatchSubmissions(taskId, batchMode) {
  const tid = Number(taskId);
  if (batchMode === 'regrade_all') {
    const [rows] = await pool.query(
      `SELECT s.id, s.student_id FROM submissions s WHERE s.task_id = ?
       AND (s.safety_status IS NULL OR s.safety_status IN ('passed', 'manual_approved'))
       ORDER BY s.id ASC`,
      [tid]
    );
    return rows;
  }
  if (batchMode === 'include_failed') {
    const [rows] = await pool.query(
      `
      SELECT s.id, s.student_id
      FROM submissions s
      LEFT JOIN grading_results gr ON s.id = gr.submission_id
      WHERE s.task_id = ?
        AND (gr.id IS NULL OR gr.status = 'ai_failed')
        AND (s.safety_status IS NULL OR s.safety_status IN ('passed', 'manual_approved'))
      ORDER BY s.id ASC
    `,
      [tid]
    );
    return rows;
  }
  if (batchMode === 'retry_failed') {
    const [rows] = await pool.query(
      `
      SELECT s.id, s.student_id
      FROM submissions s
      INNER JOIN grading_results gr ON s.id = gr.submission_id
      WHERE s.task_id = ?
        AND gr.status = 'ai_failed'
        AND (s.safety_status IS NULL OR s.safety_status IN ('passed', 'manual_approved'))
      ORDER BY s.id ASC
    `,
      [tid]
    );
    return rows;
  }
  const [rows] = await pool.query(
    `
    SELECT s.id, s.student_id
    FROM submissions s
    LEFT JOIN grading_results gr ON s.id = gr.submission_id
    WHERE s.task_id = ? AND gr.id IS NULL
      AND (s.safety_status IS NULL OR s.safety_status IN ('passed', 'manual_approved'))
    ORDER BY s.id ASC
  `,
    [tid]
  );
  return rows;
}

function emptyBatchMessage(batchMode) {
  if (batchMode === 'regrade_all') {
    return '当前任务没有学生提交，无法重批';
  }
  if (batchMode === 'retry_failed') {
    return '当前没有可重试的失败项';
  }
  if (batchMode === 'include_failed') {
    return '当前没有新的待 AI 批改提交；如需重试失败项，请进入批改任务详情重试失败项，或选择重批模式';
  }
  return '当前没有新的待 AI 批改提交；如需重试失败项，请进入批改任务详情重试失败项，或选择重批模式';
}

async function dispatchJobItems(jobId, taskId) {
  const [items] = await pool.query(
    `SELECT id, submission_id, retry_count FROM grading_job_items WHERE job_id = ? AND status IN ('pending', 'queued') ORDER BY id ASC`,
    [jobId]
  );
  if (!items.length) return { transport: 'none', count: 0 };

  if (isBullmqEnabled()) {
    await pool.query(
      `UPDATE grading_job_items SET status = 'queued', stage = 'waiting' WHERE job_id = ? AND status = 'pending'`,
      [jobId]
    );
    return enqueueJobItems(jobId, items, taskId);
  }

  return enqueueJob(jobId);
}

async function dispatchSingleItem(jobId, itemId, submissionId, taskId, retryCount = 0) {
  if (isBullmqEnabled()) {
    await pool.query(
      `UPDATE grading_job_items SET status = 'queued', stage = 'waiting' WHERE id = ? AND status = 'pending'`,
      [itemId]
    );
    const { enqueueGradingItem } = require('../utils/gradingJobQueue');
    return enqueueGradingItem({
      gradingJobId: jobId,
      gradingJobItemId: itemId,
      submissionId,
      taskId,
      retryCount,
    });
  }
  return enqueueJob(jobId);
}

async function getJobById(jobId) {
  const [rows] = await pool.query(
    `
    SELECT j.*, t.title AS task_title, u.real_name AS creator_name
    FROM grading_jobs j
    LEFT JOIN tasks t ON t.id = j.task_id
    LEFT JOIN users u ON u.id = j.created_by
    WHERE j.id = ?
  `,
    [jobId]
  );
  return rows[0] || null;
}

async function assertCanViewJob(userId, role, jobId) {
  const job = await getJobById(jobId);
  if (!job) return null;
  if (role === 'admin') return job;
  if (role !== 'teacher') return null;
  if (Number(job.created_by) !== Number(userId)) return null;
  if (job.task_id) {
    const task = await teacherOwnsTaskForGrading(userId, job.task_id);
    if (!task) return null;
  }
  return job;
}

async function createSingleJob({
  submissionId,
  userId,
  role,
  forceRegrade = false,
  regradeReason = null,
  dryRun = false,
}) {
  const sid = Number(submissionId);
  const [ex] = await pool.query('SELECT id FROM submissions WHERE id = ?', [sid]);
  if (!ex.length) {
    const err = new Error('提交不存在');
    err.status = 404;
    throw err;
  }

  if (role === 'teacher') {
    const ok = await teacherOwnsSubmissionTask(userId, sid);
    if (!ok) {
      const err = new Error('无权批改该提交');
      err.status = 403;
      throw err;
    }
  } else if (role !== 'admin') {
    const err = new Error('权限不足');
    err.status = 403;
    throw err;
  }

  const codeRunGate = await assertSubmissionCodeRunReadyForGrading(sid);
  if (!codeRunGate.ok) {
    const err = new Error(codeRunGate.message);
    err.status = codeRunGate.status || 400;
    throw err;
  }

  await assertSubmissionSafeForAiGrading(sid);

  const eligibilityRow = await loadSubmissionEligibilityRow(sid);
  assertNewAiGradeAllowed({
    gradingStatus: eligibilityRow?.grading_status,
    activeItemStatus: eligibilityRow?.active_item_status,
    forceRegrade: Boolean(forceRegrade),
  });

  const ctx = await loadSubmissionContext(sid);
  if (!ctx) {
    const err = new Error('提交不存在');
    err.status = 404;
    throw err;
  }

  const batchMode = forceRegrade ? 'force_regrade' : 'new_only';
  const jobMessage = forceRegrade ? String(regradeReason || 'teacher_manual_regrade') : '等待执行';

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      eligible: true,
      wouldCreateJob: true,
      submissionId: sid,
      taskId: toNum(ctx.task_id),
      taskTitle: ctx.task_title || null,
      forceRegrade: Boolean(forceRegrade),
      batchMode,
      jobMessage,
      reason: null,
    };
  }

  const conn = await pool.getConnection();
  let jobId;
  let itemId;
  try {
    await conn.beginTransaction();
    const [jr] = await conn.query(
      `INSERT INTO grading_jobs
        (created_by, task_id, scope_type, teaching_class_id, class_id, course_id,
         status, total_count, message, batch_mode)
       VALUES (?, ?, 'single', ?, ?, ?, 'pending', 1, ?, ?)`,
      [userId, ctx.task_id, ctx.teaching_class_id, ctx.class_id, ctx.course_id, jobMessage, batchMode]
    );
    jobId = jr.insertId;
    const [ir] = await conn.query(
      `INSERT INTO grading_job_items (job_id, submission_id, student_id, status) VALUES (?, ?, ?, 'pending')`,
      [jobId, sid, ctx.student_id]
    );
    itemId = ir.insertId;
    const [checkGr] = await conn.query('SELECT id FROM grading_results WHERE submission_id = ?', [sid]);
    if (!checkGr.length) {
      await conn.query(
        `INSERT INTO grading_results (submission_id, status, ai_batch_id) VALUES (?, 'ai_grading', NULL)`,
        [sid]
      );
    } else {
      await conn.query(
        `UPDATE grading_results SET status = 'ai_grading', ai_batch_id = NULL, graded_at = NOW() WHERE submission_id = ?`,
        [sid]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  await invalidateGradingCache(sid);
  await dispatchSingleItem(jobId, itemId, sid, ctx.task_id);
  emitSubmissionQueued(ctx);
  await refreshJobAggregates(jobId);
  await pushJobProgressById(jobId, 'job_queued', { submissionId: sid });

  return {
    jobId: Number(jobId),
    deduped: false,
    submissionId: sid,
    status: 'ai_grading',
    async: true,
    jobStatus: 'pending',
    progress: 0,
    totalCount: 1,
    finishedCount: 0,
    taskId: toNum(ctx.task_id),
    taskTitle: ctx.task_title || null,
    scopeType: 'single',
  };
}

async function createBatchJob({
  taskId,
  userId,
  role,
  batchMode: rawBatchMode,
  submissionIds: rawSubmissionIds,
  dryRun = false,
}) {
  const tid = Number(taskId);
  const batchMode = normalizeBatchMode(rawBatchMode);
  let requestedCount = 0;
  let skippedItems = [];

  if (role === 'teacher') {
    const task = await teacherOwnsTaskForGrading(userId, tid);
    if (!task) {
      const err = new Error('无权对该任务批量批改');
      err.status = 403;
      throw err;
    }
  } else if (role !== 'admin') {
    const err = new Error('权限不足');
    err.status = 403;
    throw err;
  }

  let submissions;
  if (batchMode === 'selected') {
    const ids = [...new Set((rawSubmissionIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
    requestedCount = ids.length;
    if (!ids.length) {
      const err = new Error('请选择至少一条提交');
      err.status = 400;
      throw err;
    }
    const resolved = await resolveSelectedSubmissions(tid, ids, userId, role);
    submissions = resolved.accepted;
    skippedItems = resolved.skipped;
  } else {
    submissions = await loadBatchSubmissions(tid, batchMode);
    requestedCount = submissions.length;
  }

  if (!submissions.length) {
    const emptyMessage =
      batchMode === 'selected'
        ? '当前选择中没有可发起 AI 批改的提交'
        : emptyBatchMessage(batchMode);
    return {
      jobId: null,
      taskId: tid,
      queued: 0,
      batchId: null,
      async: true,
      batchMode,
      requestedCount,
      acceptedCount: 0,
      skippedCount: skippedItems.length,
      skippedItems,
      message: emptyMessage,
    };
  }

  const toQueue = [];
  for (const row of submissions) {
    const active = await findActiveJobForSubmission(row.id);
    if (!active) toQueue.push(row);
  }

  if (!toQueue.length) {
    return {
      jobId: null,
      deduped: true,
      taskId: tid,
      queued: 0,
      batchId: null,
      async: true,
      batchMode,
      requestedCount,
      acceptedCount: 0,
      skippedCount: skippedItems.length + submissions.length,
      skippedItems: [
        ...skippedItems,
        ...submissions.map((row) => ({
          submissionId: row.id,
          reasonCode: 'ai_queued',
          reason: '已进入批改队列，请等待完成',
        })),
      ],
      message: '所选提交均已在其他批改任务队列中',
    };
  }

  const [taskRows] = await pool.query(
    'SELECT id, class_id, teaching_class_id, course_id FROM tasks WHERE id = ?',
    [tid]
  );
  const task = taskRows[0];
  const legacyBatchId = makeLegacyBatchId();

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      eligible: true,
      wouldCreateJob: toQueue.length > 0,
      jobId: null,
      taskId: tid,
      queued: toQueue.length,
      batchId: null,
      async: true,
      batchMode,
      requestedCount,
      acceptedCount: toQueue.length,
      skippedCount: skippedItems.length + (submissions.length - toQueue.length),
      skippedItems,
    };
  }

  const conn = await pool.getConnection();
  let jobId;
  try {
    await conn.beginTransaction();
    const [jr] = await conn.query(
      `INSERT INTO grading_jobs
        (created_by, task_id, scope_type, teaching_class_id, class_id, course_id,
         status, total_count, legacy_batch_id, message, batch_mode)
       VALUES (?, ?, 'batch_task', ?, ?, ?, 'pending', ?, ?, '等待执行', ?)`,
      [userId, tid, task.teaching_class_id, task.class_id, task.course_id, toQueue.length, legacyBatchId, batchMode]
    );
    jobId = jr.insertId;
    for (const row of toQueue) {
      await conn.query(
        `INSERT INTO grading_job_items (job_id, submission_id, student_id, status) VALUES (?, ?, ?, 'pending')`,
        [jobId, row.id, row.student_id]
      );
      const [gr] = await conn.query('SELECT id FROM grading_results WHERE submission_id = ?', [row.id]);
      if (!gr.length) {
        await conn.query(
          `INSERT INTO grading_results (submission_id, status, ai_batch_id) VALUES (?, 'ai_grading', ?)`,
          [row.id, legacyBatchId]
        );
      } else {
        await conn.query(
          `UPDATE grading_results SET status = 'ai_grading', ai_batch_id = ?, graded_at = NOW() WHERE submission_id = ?`,
          [legacyBatchId, row.id]
        );
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  try {
    await cache.invalidateAfterGrading(tid, userId);
  } catch {
    /* ignore */
  }

  await dispatchJobItems(jobId, tid);
  await refreshJobAggregates(jobId);
  await pushJobProgressById(jobId, 'job_queued', { legacyBatchId: String(legacyBatchId), batchMode });

  return {
    jobId: Number(jobId),
    taskId: tid,
    queued: toQueue.length,
    batchId: legacyBatchId,
    async: true,
    batchMode,
    requestedCount,
    acceptedCount: toQueue.length,
    skippedCount: skippedItems.length + (submissions.length - toQueue.length),
    skippedItems,
  };
}

async function createJobFromBody(body, userId, role) {
  const forceRegrade = Boolean(body.forceRegrade ?? body.force_regrade);
  const regradeReason = body.regradeReason ?? body.regrade_reason ?? null;
  const mode = String(body.mode || body.scope || '').toLowerCase();
  if (mode === 'single' || body.submissionId != null || body.submission_id != null) {
    return createSingleJob({
      submissionId: body.submissionId ?? body.submission_id,
      userId,
      role,
      forceRegrade,
      regradeReason,
    });
  }
  if (mode === 'batch' || mode === 'batch_task' || body.taskId != null || body.task_id != null) {
    return createBatchJob({
      taskId: body.taskId ?? body.task_id,
      userId,
      role,
      batchMode: body.batchMode ?? body.batch_mode,
      submissionIds: body.submissionIds ?? body.submission_ids,
    });
  }
  const err = new Error('请指定 mode=single+submissionId 或 mode=batch+taskId');
  err.status = 400;
  throw err;
}

async function listJobs({ userId, role, page = 1, pageSize = 20, status }) {
  const limit = Math.min(100, Math.max(1, pageSize));
  const offset = (Math.max(1, page) - 1) * limit;
  const params = [];
  let where = '1=1';

  if (role === 'teacher') {
    where += ' AND j.created_by = ?';
    params.push(userId);
  } else if (role !== 'admin') {
    return { rows: [], total: 0, page, pageSize: limit };
  }

  if (status) {
    where += ' AND j.status = ?';
    params.push(status);
  }

  const [countRows] = await pool.query(`SELECT COUNT(*) AS c FROM grading_jobs j WHERE ${where}`, params);
  const total = toNum(countRows[0]?.c) ?? 0;

  const [rows] = await pool.query(
    `
    SELECT j.*, t.title AS task_title, u.real_name AS creator_name
    FROM grading_jobs j
    LEFT JOIN tasks t ON t.id = j.task_id
    LEFT JOIN users u ON u.id = j.created_by
    WHERE ${where}
    ORDER BY j.created_at DESC
    LIMIT ? OFFSET ?
  `,
    [...params, limit, offset]
  );

  return { rows, total, page, pageSize: limit };
}

async function getJobDetail(jobId, userId, role, opts = {}) {
  const job = await assertCanViewJob(userId, role, jobId);
  if (!job) {
    const err = new Error('任务不存在或无权查看');
    err.status = 404;
    throw err;
  }

  const ip = Math.max(1, opts.itemPage || 1);
  const ips = Math.min(200, Math.max(1, opts.itemPageSize || 50));
  const offset = (ip - 1) * ips;

  const [items] = await pool.query(
    `
    SELECT i.*, u.real_name AS student_name, u.student_no
    FROM grading_job_items i
    LEFT JOIN users u ON u.id = i.student_id
    WHERE i.job_id = ?
    ORDER BY i.id ASC
    LIMIT ? OFFSET ?
  `,
    [jobId, ips, offset]
  );

  const [ic] = await pool.query('SELECT COUNT(*) AS c FROM grading_job_items WHERE job_id = ?', [jobId]);

  return { job, items, itemTotal: toNum(ic[0]?.c) ?? 0, itemPage: ip, itemPageSize: ips };
}

async function cancelJob(jobId, userId, role) {
  const job = await assertCanViewJob(userId, role, jobId);
  if (!job) {
    const err = new Error('任务不存在或无权操作');
    err.status = 403;
    throw err;
  }
  if (!['pending', 'running'].includes(job.status)) {
    const err = new Error('当前状态不可取消');
    err.status = 400;
    throw err;
  }

  const [queuedItems] = await pool.query(
    `SELECT id, retry_count FROM grading_job_items WHERE job_id = ? AND status IN ('pending', 'queued')`,
    [jobId]
  );
  if (queuedItems.length && isBullmqEnabled()) {
    await removeQueuedItemJobs(queuedItems);
  }

  const [runningItems] = await pool.query(
    `SELECT id, submission_id FROM grading_job_items WHERE job_id = ? AND status = 'running'`,
    [jobId]
  );
  for (const row of runningItems) {
    await pool.query(
      `UPDATE grading_results SET status = 'pending' WHERE submission_id = ? AND status = 'ai_grading'`,
      [row.submission_id]
    );
  }

  await pool.query(
    `UPDATE grading_jobs SET status = 'cancelled', message = '任务已取消', finished_at = NOW() WHERE id = ?`,
    [jobId]
  );
  await pool.query(
    `UPDATE grading_job_items SET status = 'cancelled', stage = 'cancelled', finished_at = NOW()
     WHERE job_id = ? AND status IN ('pending', 'queued')`,
    [jobId]
  );
  await pool.query(
    `UPDATE grading_job_items SET stage = 'cancelling', error_message = '任务已取消'
     WHERE job_id = ? AND status = 'running'`,
    [jobId]
  );

  await refreshJobAggregates(jobId);
  await pushJobProgressById(jobId, 'job_cancelled');
  await notifyJobTerminal(jobId);

  return { jobId: Number(jobId), status: 'cancelled' };
}

async function retryFailedItems(jobId, userId, role) {
  const job = await assertCanViewJob(userId, role, jobId);
  if (!job) {
    const err = new Error('任务不存在或无权操作');
    err.status = 403;
    throw err;
  }

  const [failed] = await pool.query(
    `SELECT id, submission_id, retry_count FROM grading_job_items WHERE job_id = ? AND status = 'failed'`,
    [jobId]
  );
  if (!failed.length) {
    return { jobId: Number(jobId), retried: 0 };
  }

  for (const row of failed) {
    await pool.query(
      `UPDATE grading_job_items SET status = 'pending', stage = 'waiting', error_message = NULL,
         finished_at = NULL, retry_count = retry_count + 1 WHERE id = ?`,
      [row.id]
    );
    await markSubmissionAiGrading(row.submission_id, job.legacy_batch_id);
  }

  await pool.query(
    `UPDATE grading_jobs SET status = 'pending', finished_at = NULL, message = '重试失败项' WHERE id = ?`,
    [jobId]
  );

  await dispatchJobItems(jobId, job.task_id);
  await refreshJobAggregates(jobId);
  await pushJobProgressById(jobId, 'job_retry');
  return { jobId: Number(jobId), retried: failed.length };
}

async function getProgressByLegacyBatchId(batchId) {
  const [rows] = await pool.query(
    'SELECT * FROM grading_jobs WHERE legacy_batch_id = ? ORDER BY id DESC LIMIT 1',
    [batchId]
  );
  return rows[0] || null;
}

async function getWorkerHealth() {
  const { ensureConnected } = require('../utils/redisClient');
  const { getQueueHealthStats, getWorkerHeartbeat } = require('../utils/gradingJobQueue');
  const { getQueueName, getBullmqPrefix } = require('../utils/bullmqGradingConfig');
  const redis = await ensureConnected();
  const stats = await getQueueHealthStats();
  const workerLastSeenAt = await getWorkerHeartbeat();
  return {
    bullmqEnabled: isBullmqEnabled(),
    bullmqPrefix: getBullmqPrefix(),
    queueName: getQueueName(),
    redisConnected: Boolean(redis),
    waiting: stats.waiting,
    active: stats.active,
    completed: stats.completed,
    failed: stats.failed,
    workerLastSeenAt,
  };
}

module.exports = {
  createSingleJob,
  createBatchJob,
  createJobFromBody,
  listJobs,
  getJobDetail,
  cancelJob,
  retryFailedItems,
  getProgressByLegacyBatchId,
  getWorkerHealth,
};
