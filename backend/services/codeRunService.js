/**
 * 代码运行 API 服务（Phase B：HTTP 入队，不接入任务发布 / AI）
 */
const pool = require('../config/database');
const {
  isCodeRunnerEnabled,
  getDefaultTimeoutSec,
} = require('../utils/codeRunConfig');
const { enqueueCodeRunJob } = require('../utils/codeRunJobQueue');
const {
  allocateJobDir,
  writeInlineJobFiles,
  cleanupJobDir,
} = require('../utils/codeRunJobPaths');
const {
  isLanguageSupported,
  validatePythonSource,
} = require('../utils/codeRunLanguageSpec');
const {
  teacherOwnsSubmissionTask,
  studentCanAccessTask,
} = require('../utils/accessControl');
const { computeSubmissionCodeHash } = require('../utils/submissionContentBuild');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function toNum(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatJobRow(row) {
  if (!row) return null;
  return {
    jobId: row.id,
    scopeType: row.scope_type,
    language: row.language,
    sourceType: row.source_type,
    status: row.status,
    timeoutSec: row.timeout_sec,
    message: row.message,
    errorMessage: row.error_message,
    submissionId: row.submission_id,
    studentId: row.student_id,
    taskId: row.task_id,
    practiceAttemptId: row.practice_attempt_id,
    createdBy: row.created_by,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  };
}

function formatResultRow(row) {
  if (!row) return null;
  return {
    resultId: row.id,
    jobId: row.job_id,
    compileExitCode: row.compile_exit_code,
    runExitCode: row.run_exit_code,
    compileLog: row.compile_log,
    stdout: row.stdout,
    stderr: row.stderr,
    timedOut: Boolean(row.timed_out),
    durationMs: row.duration_ms,
    entryFileFound: Boolean(row.entry_file_found),
    summary: row.summary,
    createdAt: row.created_at,
  };
}

async function getJobById(jobId) {
  const [rows] = await pool.query('SELECT * FROM code_run_jobs WHERE id = ?', [jobId]);
  return rows[0] || null;
}

async function getResultByJobId(jobId) {
  const [rows] = await pool.query('SELECT * FROM code_run_results WHERE job_id = ?', [jobId]);
  return rows[0] || null;
}

async function loadSubmission(submissionId) {
  const [rows] = await pool.query(
    'SELECT id, student_id, task_id FROM submissions WHERE id = ?',
    [submissionId]
  );
  return rows[0] || null;
}

async function canAccessCodeRunJob(userId, role, job) {
  if (!job) return false;
  if (role === 'admin') return true;
  if (Number(job.created_by) === Number(userId)) return true;
  if (job.student_id != null && Number(job.student_id) === Number(userId)) return true;

  if (job.submission_id) {
    const sub = await loadSubmission(job.submission_id);
    if (!sub) return false;
    if (role === 'student') return Number(sub.student_id) === Number(userId);
    if (role === 'teacher') {
      const ctx = await teacherOwnsSubmissionTask(userId, job.submission_id);
      return Boolean(ctx);
    }
  }

  if (role === 'teacher' && job.task_id) {
    const [t] = await pool.query('SELECT created_by FROM tasks WHERE id = ?', [job.task_id]);
    return t[0] && Number(t[0].created_by) === Number(userId);
  }

  return false;
}

async function assertJobAccess(userId, role, jobId) {
  const job = await getJobById(jobId);
  if (!job) throw httpError(404, '任务不存在');
  const ok = await canAccessCodeRunJob(userId, role, job);
  if (!ok) throw httpError(403, '无权访问该代码运行任务');
  return job;
}

async function createInlineJob(opts) {
  if (!isCodeRunnerEnabled()) {
    throw httpError(503, 'CODE_RUNNER_ENABLED=0，代码运行功能未启用');
  }

  const language = String(opts.language || 'python').toLowerCase();
  if (!isLanguageSupported(language)) {
    throw httpError(400, `不支持的运行语言: ${language}`);
  }

  if (language === 'python') {
    const v = validatePythonSource(opts.sourceCode);
    if (!v.ok) throw httpError(400, v.reason);
  }

  const createdBy = Number(opts.createdBy);
  if (!Number.isFinite(createdBy) || createdBy <= 0) {
    throw httpError(400, '无效 createdBy');
  }

  const timeoutSec = Math.min(
    60,
    Math.max(2, Number(opts.timeoutSec) || getDefaultTimeoutSec())
  );

  const scopeType = opts.scopeType || 'manual';
  const codeHash =
    opts.codeHash ||
    computeSubmissionCodeHash({
      codeContent: opts.sourceCode,
      codeLanguage: language,
      attachmentHashes: opts.attachmentHashes || [],
    });

  const [insert] = await pool.query(
    `INSERT INTO code_run_jobs
      (scope_type, language, source_type, code_hash, status, timeout_sec, created_by,
       submission_id, student_id, task_id, practice_attempt_id, attachment_id)
     VALUES (?, ?, 'inline', ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
    [
      scopeType,
      language,
      codeHash,
      timeoutSec,
      createdBy,
      opts.submissionId ?? null,
      opts.studentId ?? null,
      opts.taskId ?? null,
      opts.practiceAttemptId ?? null,
      opts.attachmentId ?? null,
    ]
  );

  const jobId = insert.insertId;
  const { relative, absolute } = await allocateJobDir(jobId);
  await writeInlineJobFiles(absolute, language, opts.sourceCode, opts.stdin);
  await pool.query('UPDATE code_run_jobs SET job_dir = ? WHERE id = ?', [relative, jobId]);

  if (opts.skipEnqueue) {
    return { jobId, transport: 'sync', jobDir: relative, codeHash };
  }

  const transport = await enqueueCodeRunJob(jobId);
  return { jobId, transport: transport.transport, jobDir: relative, codeHash };
}

async function createJobFromBody(body, userId, role) {
  const sourceCode = body?.sourceCode;
  if (sourceCode == null || String(sourceCode).trim() === '') {
    throw httpError(400, '缺少 sourceCode');
  }

  const language = String(body.language || 'python').toLowerCase();
  let scopeType = 'manual';
  let submissionId = toNum(body.submissionId);
  let studentId = role === 'student' ? userId : toNum(body.studentId);
  let taskId = toNum(body.taskId);
  let practiceAttemptId = toNum(body.practiceAttemptId);

  if (submissionId) {
    const sub = await loadSubmission(submissionId);
    if (!sub) throw httpError(404, '提交不存在');
    if (role === 'student' && Number(sub.student_id) !== Number(userId)) {
      throw httpError(403, '无权对该提交运行代码');
    }
    if (role === 'teacher') {
      const ctx = await teacherOwnsSubmissionTask(userId, submissionId);
      if (!ctx) throw httpError(403, '无权对该提交运行代码');
    }
    studentId = sub.student_id;
    taskId = sub.task_id;
    scopeType = 'submission';
  }

  if (practiceAttemptId) {
    const [rows] = await pool.query(
      'SELECT id, student_id, template_id FROM online_practice_attempts WHERE id = ?',
      [practiceAttemptId]
    );
    if (!rows[0]) throw httpError(404, '练习实例不存在');
    if (role === 'student' && Number(rows[0].student_id) !== Number(userId)) {
      throw httpError(403, '无权运行该练习');
    }
    if (role === 'teacher') {
      throw httpError(403, '教师请通过模板管理运行练习');
    }
    studentId = rows[0].student_id;
    scopeType = 'practice';
  }

  if (taskId && role === 'student') {
    const ok = await studentCanAccessTask(userId, taskId);
    if (!ok) throw httpError(403, '无权访问该任务');
  }

  const { jobId, transport, codeHash } = await createInlineJob({
    language,
    sourceCode,
    stdin: body.stdin,
    createdBy: userId,
    timeoutSec: body.timeoutSec,
    scopeType,
    submissionId,
    studentId,
    taskId,
    practiceAttemptId,
  });

  return {
    jobId,
    status: 'pending',
    async: true,
    transport,
    codeHash,
  };
}

async function getJobDetail(jobId, userId, role) {
  const job = await assertJobAccess(userId, role, jobId);
  const result = await getResultByJobId(jobId);
  return {
    ...formatJobRow(job),
    result: result
      ? {
          resultId: result.id,
          runExitCode: result.run_exit_code,
          timedOut: Boolean(result.timed_out),
          durationMs: result.duration_ms,
          summary: result.summary,
        }
      : null,
  };
}

async function getJobResult(jobId, userId, role) {
  const job = await assertJobAccess(userId, role, jobId);
  const result = await getResultByJobId(jobId);
  return {
    jobId: job.id,
    status: job.status,
    codeHash: job.code_hash || null,
    result: formatResultRow(result),
  };
}

async function listJobs(query, userId, role) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(query.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;
  const status = query.status ? String(query.status).trim() : null;
  const taskId = toNum(query.taskId);
  const submissionId = toNum(query.submissionId);

  const where = [];
  const params = [];

  if (role === 'teacher') {
    where.push(`(
      j.created_by = ?
      OR t.created_by = ?
      OR EXISTS (
        SELECT 1 FROM submissions s2
        INNER JOIN tasks t2 ON t2.id = s2.task_id
        WHERE s2.id = j.submission_id AND t2.created_by = ?
      )
    )`);
    params.push(userId, userId, userId);
  }

  if (status) {
    where.push('j.status = ?');
    params.push(status);
  }
  if (taskId) {
    where.push('j.task_id = ?');
    params.push(taskId);
  }
  if (submissionId) {
    where.push('j.submission_id = ?');
    params.push(submissionId);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [countRows] = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM code_run_jobs j
    LEFT JOIN tasks t ON t.id = j.task_id
    ${whereSql}
  `,
    params
  );

  const [rows] = await pool.query(
    `
    SELECT j.*
    FROM code_run_jobs j
    LEFT JOIN tasks t ON t.id = j.task_id
    ${whereSql}
    ORDER BY j.id DESC
    LIMIT ? OFFSET ?
  `,
    [...params, pageSize, offset]
  );

  return {
    data: rows.map(formatJobRow),
    pagination: {
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
    },
  };
}

async function cancelJob(jobId, userId, role) {
  const job = await assertJobAccess(userId, role, jobId);
  if (job.status !== 'pending') {
    throw httpError(400, '仅 pending 状态的任务可取消');
  }

  await pool.query(
    `UPDATE code_run_jobs SET status = 'cancelled', message = '任务已取消', finished_at = NOW()
     WHERE id = ? AND status = 'pending'`,
    [jobId]
  );

  if (job.job_dir) {
    await cleanupJobDir(job.job_dir);
  }

  return { jobId: Number(jobId), status: 'cancelled' };
}

module.exports = {
  createInlineJob,
  createJobFromBody,
  getJobById,
  getResultByJobId,
  getJobDetail,
  getJobResult,
  listJobs,
  cancelJob,
  canAccessCodeRunJob,
  formatJobRow,
  formatResultRow,
};
