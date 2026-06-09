/**
 * AI 批改任务：Socket 进度（user:{teacherId} + role:admin）与站内通知
 */
const pool = require('../config/database');
const rt = require('./realtimeEmit');
const { notifyUser } = require('./notify');

function toNum(v) {
  if (v == null) return null;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchJobSnapshot(jobId) {
  const [rows] = await pool.query(
    `
    SELECT j.*, t.title AS task_title
    FROM grading_jobs j
    LEFT JOIN tasks t ON t.id = j.task_id
    WHERE j.id = ?
  `,
    [jobId]
  );
  return rows[0] || null;
}

function buildProgressPayload(job, action, extra = {}) {
  return {
    teacherId: toNum(job.created_by),
    jobId: toNum(job.id),
    action,
    status: job.status,
    scopeType: job.scope_type,
    taskId: toNum(job.task_id),
    taskTitle: job.task_title || null,
    totalCount: toNum(job.total_count) ?? 0,
    finishedCount: toNum(job.finished_count) ?? 0,
    successCount: toNum(job.success_count) ?? 0,
    failedCount: toNum(job.failed_count) ?? 0,
    progress: toNum(job.progress) ?? 0,
    message: job.message,
    legacyBatchId: job.legacy_batch_id != null ? String(job.legacy_batch_id) : null,
    ...extra,
  };
}

function pushJobProgress(job, action, extra = {}) {
  try {
    rt.emitGradingJobProgress(buildProgressPayload(job, action, extra));
  } catch {
    /* ignore */
  }
}

async function pushJobProgressById(jobId, action, extra = {}) {
  const job = await fetchJobSnapshot(jobId);
  if (job) pushJobProgress(job, action, extra);
  return job;
}

function describeJob(job) {
  if (job.scope_type === 'single') {
    return job.task_title ? `单份批改 · ${job.task_title}` : '单份 AI 批改';
  }
  return job.task_title ? `批量批改 · ${job.task_title}` : '批量 AI 批改';
}

async function notifyJobTerminal(jobId, { skipIfCancelled = false } = {}) {
  const job = await fetchJobSnapshot(jobId);
  if (!job) return;

  const st = job.status;
  if (skipIfCancelled && st === 'cancelled') return;

  const label = describeJob(job);
  let type;
  let title;
  let body;

  if (st === 'completed') {
    type = 'grade_job_completed';
    title = 'AI 批改已完成';
    body = `${label}：全部 ${job.success_count} 份批改成功。`;
  } else if (st === 'partial_failed') {
    type = 'grade_job_partial';
    title = 'AI 批改部分失败';
    body = `${label}：成功 ${job.success_count} 份，失败 ${job.failed_count} 份。`;
  } else if (st === 'failed') {
    type = 'grade_job_failed';
    title = 'AI 批改全部失败';
    body = `${label}：${job.failed_count} 份均未成功，请查看任务详情后重试。`;
  } else if (st === 'cancelled') {
    type = 'grade_job_cancelled';
    title = '批改任务已取消';
    body = `${label}：任务已取消，未执行项已跳过。`;
  } else {
    return;
  }

  try {
    await notifyUser(Number(job.created_by), {
      type,
      title,
      body,
      refType: 'grading_job',
      refId: Number(job.id),
    });
  } catch (e) {
    console.warn('[gradingJobNotify] notify failed', e?.message || e);
  }
}

module.exports = {
  fetchJobSnapshot,
  pushJobProgress,
  pushJobProgressById,
  notifyJobTerminal,
};
