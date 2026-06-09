/**
 * Legacy job-level 处理器（BULLMQ_ENABLED=0 时由 gradingJobWorker 消费整 job）
 * BullMQ 模式下 item 由 gradingItemProcessor 处理；此处保留 stale 回收与 legacy 串行 fallback
 */
const pool = require('../config/database');
const { markGradingFailed } = require('./gradingQueue');
const { processGradingJobItem } = require('./gradingItemProcessor');
const { refreshJobAggregates, finalizeJob, getJobStatus } = require('./gradingJobAggregator');
const { pushJobProgressById } = require('./gradingJobNotify');
const { isBullmqEnabled } = require('./bullmqGradingConfig');

const STALE_RUNNING_MINUTES = Math.max(
  3,
  parseInt(process.env.GRADING_JOB_STALE_MINUTES || '10', 10) || 10
);
const STALE_FAIL_MSG = `Worker 进程中断或批改超时（超过 ${STALE_RUNNING_MINUTES} 分钟）`;

function toNum(v) {
  if (v == null) return 0;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function recoverStaleRunningItems(jobId) {
  const [stale] = await pool.query(
    `
    SELECT id, submission_id FROM grading_job_items
    WHERE job_id = ?
      AND status = 'running'
      AND started_at IS NOT NULL
      AND started_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
  `,
    [jobId, STALE_RUNNING_MINUTES]
  );
  if (!stale.length) return 0;

  for (const item of stale) {
    try {
      await markGradingFailed(item.submission_id, STALE_FAIL_MSG);
    } catch {
      /* ignore */
    }
    await pool.query(
      `UPDATE grading_job_items SET status = 'failed', stage = 'failed', error_message = ?, finished_at = NOW() WHERE id = ?`,
      [STALE_FAIL_MSG.slice(0, 480), item.id]
    );
  }
  await refreshJobAggregates(jobId);
  await finalizeJob(jobId);
  return stale.length;
}

async function recoverAllStaleRunningItems() {
  const [rows] = await pool.query(
    `
    SELECT DISTINCT job_id FROM grading_job_items
    WHERE status = 'running'
      AND started_at IS NOT NULL
      AND started_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
  `,
    [STALE_RUNNING_MINUTES]
  );
  let total = 0;
  for (const row of rows) {
    total += await recoverStaleRunningItems(row.job_id);
  }
  if (total > 0) {
    console.warn(`[gradingJobProcessor] recovered ${total} stale running item(s)`);
  }
  return total;
}

async function processGradingJob(jobId) {
  if (isBullmqEnabled()) {
    console.warn('[gradingJobProcessor] BULLMQ_ENABLED=1，请使用 gradingBullmqWorker，跳过 legacy job 处理', jobId);
    return;
  }

  const id = Number(jobId);
  if (!Number.isFinite(id)) return;

  const [jobs] = await pool.query('SELECT id, status, task_id FROM grading_jobs WHERE id = ?', [id]);
  if (!jobs.length) {
    console.warn('[gradingJobProcessor] job not found', id);
    return;
  }
  if (jobs[0].status === 'cancelled') return;

  await recoverStaleRunningItems(id);
  const jobStAfterRecover = await getJobStatus(id);
  if (
    jobStAfterRecover === 'cancelled' ||
    jobStAfterRecover === 'completed' ||
    jobStAfterRecover === 'failed' ||
    jobStAfterRecover === 'partial_failed'
  ) {
    return;
  }

  const taskId = jobs[0].task_id;

  await pool.query(
    `UPDATE grading_jobs SET status = 'running',
       started_at = COALESCE(started_at, NOW()),
       message = '批改任务执行中'
     WHERE id = ? AND status IN ('pending', 'running', 'partial_failed', 'failed', 'completed')`,
    [id]
  );
  await pushJobProgressById(id, 'job_started');

  const [items] = await pool.query(
    `SELECT id, submission_id FROM grading_job_items
     WHERE job_id = ? AND status IN ('pending', 'queued') ORDER BY id ASC`,
    [id]
  );

  for (const item of items) {
    const jobSt = await getJobStatus(id);
    if (jobSt === 'cancelled') {
      await pool.query(
        `UPDATE grading_job_items SET status = 'cancelled', stage = 'cancelled', finished_at = NOW()
         WHERE id = ? AND status IN ('pending', 'queued')`,
        [item.id]
      );
      continue;
    }

    try {
      await processGradingJobItem(
        {
          gradingJobId: id,
          gradingJobItemId: item.id,
          submissionId: item.submission_id,
          taskId,
        },
        { attempt: 1 }
      );
    } catch {
      /* item 已记录 failed */
    }
  }

  await finalizeJob(id);
}

module.exports = {
  processGradingJob,
  recoverStaleRunningItems,
  recoverAllStaleRunningItems,
  STALE_RUNNING_MINUTES,
};
