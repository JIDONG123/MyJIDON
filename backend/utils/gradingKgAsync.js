/**
 * 批改完成后可选异步触发知识图谱构建（不阻塞批改主链路）
 */
const pool = require('../config/database');

async function maybeEnqueueKgAfterGradingJob(jobId) {
  const [rows] = await pool.query(
    'SELECT task_id, class_id, teaching_class_id, course_id FROM grading_jobs WHERE id = ?',
    [jobId]
  );
  if (!rows[0]) return;
  const job = rows[0];
  const { createBuildJob } = require('../services/kgBuildService');
  const { enqueueBuild } = require('../utils/kgBuildQueue');

  let scopeType = 'task';
  let scopeId = job.task_id;
  if (!scopeId && job.teaching_class_id) {
    scopeType = 'teaching_class';
    scopeId = job.teaching_class_id;
  } else if (!scopeId && job.class_id) {
    scopeType = 'class';
    scopeId = job.class_id;
  }
  if (!scopeId) return;

  const [creator] = await pool.query('SELECT created_by FROM grading_jobs WHERE id = ?', [jobId]);
  const buildJobId = await createBuildJob({
    scopeType,
    scopeId,
    requestedBy: creator[0]?.created_by,
  });
  if (buildJobId) await enqueueBuild(buildJobId);
}

module.exports = { maybeEnqueueKgAfterGradingJob };
