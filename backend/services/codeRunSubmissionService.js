/**
 * 学生提交作业后自动入队代码运行
 */
const fsp = require('fs').promises;
const pool = require('../config/database');
const { isCodeRunnerEnabled, getDefaultTimeoutSec } = require('../utils/codeRunConfig');
const { enqueueCodeRunJob } = require('../utils/codeRunJobQueue');
const { allocateJobDir } = require('../utils/codeRunJobPaths');
const { isLanguageSupported } = require('../utils/codeRunLanguageSpec');
const { parseTaskCodeRunConfig } = require('../utils/taskCodeRunConfig');
const { materializeSubmissionJobDir } = require('./codeRunMaterialize');

async function cancelPendingSubmissionJobs(submissionId) {
  await pool.query(
    `UPDATE code_run_jobs
     SET status = 'cancelled', message = '已被新提交取代', finished_at = NOW()
     WHERE submission_id = ? AND status = 'pending'`,
    [submissionId]
  );
}

async function loadSubmissionForCodeRun(submissionId) {
  const [rows] = await pool.query(
    `
    SELECT s.id, s.student_id, s.task_id, s.file_path, s.file_name, s.file_type,
           s.code_content, s.code_language, s.code_run_bound_hash,
           t.code_run_enabled, t.code_run_language, t.code_run_config
    FROM submissions s
    INNER JOIN tasks t ON t.id = s.task_id
    WHERE s.id = ?
  `,
    [submissionId]
  );
  return rows[0] || null;
}

/**
 * 将提交前在代码区运行的 job/result 绑定到本次 submission
 */
async function linkPreSubmitCodeRunToSubmission(submissionId, { taskId, studentId, codeHash }) {
  if (!codeHash || !submissionId) return { linked: false, reason: 'missing_params' };

  const [jobs] = await pool.query(
    `
    SELECT j.id, j.status, r.id AS result_id, r.summary AS result_summary
    FROM code_run_jobs j
    INNER JOIN code_run_results r ON r.job_id = j.id
    WHERE j.task_id = ? AND j.student_id = ? AND j.code_hash = ?
      AND j.source_type = 'inline'
      AND j.status IN ('completed', 'failed', 'timeout')
    ORDER BY j.id DESC
    LIMIT 1
  `,
    [taskId, studentId, codeHash]
  );

  const job = jobs[0];
  if (!job) return { linked: false, reason: 'no_matching_job' };

  const summary = String(job.result_summary || '').slice(0, 500) || '运行完成';

  await pool.query(
    `UPDATE code_run_jobs SET submission_id = ?, scope_type = 'submission' WHERE id = ?`,
    [submissionId, job.id]
  );
  await pool.query(
    `UPDATE submissions SET code_run_result_id = ?, code_run_summary = ?, code_run_bound_hash = ? WHERE id = ?`,
    [job.result_id, summary, codeHash, submissionId]
  );

  return { linked: true, jobId: job.id, resultId: job.result_id };
}

/** 若 submission 有 bound_hash 但缺 result_id，尝试从 pre-submit job 自愈绑定 */
async function ensureSubmissionCodeRunLinked(submissionId) {
  const row = await loadSubmissionForCodeRun(submissionId);
  if (!row?.code_run_enabled) return { ok: true, linked: false };
  if (row.code_run_result_id) return { ok: true, linked: false, already: true };

  const hash = row.code_run_bound_hash || row.code_content_hash;
  if (!hash) return { ok: true, linked: false };

  const r = await linkPreSubmitCodeRunToSubmission(submissionId, {
    taskId: row.task_id,
    studentId: row.student_id,
    codeHash: hash,
  });
  return { ok: true, ...r };
}

async function enqueueSubmissionCodeRun(submissionId) {
  if (!isCodeRunnerEnabled()) {
    return { skipped: true, reason: 'runner_disabled' };
  }

  const row = await loadSubmissionForCodeRun(submissionId);
  if (!row || !row.code_run_enabled) {
    return { skipped: true, reason: 'task_disabled' };
  }

  const language = String(row.code_run_language || 'python').toLowerCase();
  if (!isLanguageSupported(language)) {
    return { skipped: true, reason: 'language_unsupported' };
  }

  const taskConfig = parseTaskCodeRunConfig(row.code_run_config);
  const timeoutSec = taskConfig.timeoutSec || getDefaultTimeoutSec();

  await cancelPendingSubmissionJobs(submissionId);

  await pool.query(
    `UPDATE submissions SET code_run_result_id = NULL, code_run_summary = '排队中…' WHERE id = ?`,
    [submissionId]
  );

  const [insert] = await pool.query(
    `INSERT INTO code_run_jobs
      (scope_type, language, source_type, status, timeout_sec, created_by,
       submission_id, student_id, task_id, message)
     VALUES ('submission', ?, 'job_dir', 'pending', ?, ?, ?, ?, ?, '等待运行')`,
    [language, timeoutSec, row.student_id, submissionId, row.student_id, row.task_id]
  );

  const jobId = insert.insertId;
  const { relative, absolute } = await allocateJobDir(jobId);

  try {
    row._jobDirAbs = absolute;
    await materializeSubmissionJobDir(row, language, taskConfig);
    await pool.query('UPDATE code_run_jobs SET job_dir = ? WHERE id = ?', [relative, jobId]);
    const transport = await enqueueCodeRunJob(jobId);
    return { jobId, transport: transport.transport };
  } catch (e) {
    console.error('[codeRunSubmission] materialize failed', submissionId, e.message);
    await pool.query(
      `UPDATE code_run_jobs SET status = 'failed', error_message = ?, message = ?, finished_at = NOW()
       WHERE id = ?`,
      [String(e.message || '准备运行失败').slice(0, 480), String(e.message).slice(0, 500), jobId]
    );
    await pool.query(`UPDATE submissions SET code_run_summary = ? WHERE id = ?`, [
      String(e.message).slice(0, 500),
      submissionId,
    ]);
    await fsp.rm(absolute, { recursive: true, force: true }).catch(() => {});
    return { failed: true, message: e.message };
  }
}

module.exports = {
  enqueueSubmissionCodeRun,
  loadSubmissionForCodeRun,
  linkPreSubmitCodeRunToSubmission,
  ensureSubmissionCodeRunLinked,
};
