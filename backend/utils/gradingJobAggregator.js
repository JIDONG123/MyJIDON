/**
 * grading_jobs 聚合进度（MySQL 为业务状态权威）
 */
const pool = require('../config/database');
const { pushJobProgressById, notifyJobTerminal } = require('./gradingJobNotify');

function toNum(v) {
  if (v == null) return 0;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function getJobStatus(jobId) {
  const [rows] = await pool.query('SELECT status FROM grading_jobs WHERE id = ?', [jobId]);
  return rows[0]?.status || null;
}

async function refreshJobAggregates(jobId) {
  const [stats] = await pool.query(
    `
    SELECT
      COUNT(*) AS total,
      SUM(status IN ('pending','queued')) AS pending,
      SUM(status = 'running') AS running,
      SUM(status IN ('success','failed','skipped','cancelled')) AS finished,
      SUM(status = 'success') AS success,
      SUM(status = 'failed') AS failed,
      SUM(status IN ('skipped','cancelled')) AS skipped
    FROM grading_job_items WHERE job_id = ?
  `,
    [jobId]
  );
  const row = stats[0] || {};
  const total = toNum(row.total);
  const pending = toNum(row.pending);
  const running = toNum(row.running);
  const finished = toNum(row.finished);
  const success = toNum(row.success);
  const failed = toNum(row.failed);
  const skipped = toNum(row.skipped);
  const progress = total > 0 ? Math.min(100, Math.round((finished / total) * 100)) : 0;

  let message = `进度 ${finished}/${total}`;
  if (running > 0) message = `批改进行中 ${finished}/${total}（${running} 执行中）`;
  else if (pending > 0 && finished < total) message = `等待执行 ${pending}/${total}`;

  await pool.query(
    `UPDATE grading_jobs SET
       finished_count = ?, success_count = ?, failed_count = ?,
       pending_count = ?, running_count = ?, skipped_count = ?,
       progress = ?, message = ?, updated_at = NOW()
     WHERE id = ?`,
    [finished, success, failed, pending, running, skipped, progress, message.slice(0, 500), jobId]
  );

  return { total, pending, running, finished, success, failed, skipped, progress, active: pending + running };
}

async function finalizeJob(jobId) {
  const parentSt = await getJobStatus(jobId);
  if (parentSt === 'cancelled') {
    await pool.query(
      `UPDATE grading_jobs SET finished_at = COALESCE(finished_at, NOW()), progress = 100,
       message = COALESCE(message, '任务已取消') WHERE id = ?`,
      [jobId]
    );
    await pushJobProgressById(jobId, 'job_finished');
    return;
  }

  const agg = await refreshJobAggregates(jobId);
  if (agg.active > 0) return;

  let status = 'completed';
  if (agg.failed > 0 && agg.success > 0) status = 'partial_failed';
  else if (agg.failed > 0 && agg.success === 0) status = 'failed';

  const summary =
    agg.failed > 0
      ? `完成 ${agg.success} 份，失败 ${agg.failed} 份`
      : `全部 ${agg.success} 份批改成功`;

  await pool.query(
    `UPDATE grading_jobs SET status = ?, finished_at = NOW(), progress = 100,
       message = ?, error_summary = ?
     WHERE id = ? AND status NOT IN ('cancelled')`,
    [status, summary, agg.failed > 0 ? summary : null, jobId]
  );

  await pushJobProgressById(jobId, 'job_finished');
  await notifyJobTerminal(jobId);

  if (status === 'completed' || status === 'partial_failed') {
    try {
      if (process.env.KG_ASYNC_AFTER_GRADING_JOB === '1') {
        const { maybeEnqueueKgAfterGradingJob } = require('./gradingKgAsync');
        await maybeEnqueueKgAfterGradingJob(jobId);
      }
    } catch {
      /* KG 失败不影响批改 */
    }
  }
}

module.exports = {
  getJobStatus,
  refreshJobAggregates,
  finalizeJob,
};
