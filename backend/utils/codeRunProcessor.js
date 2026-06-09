/**
 * 执行单个 code_run_job（仅 Code Runner Worker 调用）
 */
const pool = require('../config/database');
const { getStaleMinutes } = require('../utils/codeRunConfig');
const { resolveJobDir, cleanupJobDir } = require('../utils/codeRunJobPaths');
const { buildSummary, isLanguageSupported, classifyRunOutcome, formatErrorMessage } = require('../utils/codeRunLanguageSpec');
const { getRunnerAdapter } = require('../adapters');

const STALE_RUNNING_MINUTES = getStaleMinutes();
const STALE_FAIL_MSG = `Worker 进程中断或运行超时（超过 ${STALE_RUNNING_MINUTES} 分钟）`;

async function getJob(jobId) {
  const [rows] = await pool.query('SELECT * FROM code_run_jobs WHERE id = ?', [jobId]);
  return rows[0] || null;
}

async function claimJob(jobId) {
  const [r] = await pool.query(
    `UPDATE code_run_jobs SET status = 'running', started_at = NOW(), message = '运行中'
     WHERE id = ? AND status = 'pending'`,
    [jobId]
  );
  return r.affectedRows > 0;
}

async function saveResult(jobId, runPayload, finalStatus) {
  const summary = buildSummary({
    timedOut: runPayload.timedOut,
    entryFileFound: runPayload.entryFileFound,
    compileExitCode: runPayload.compileExitCode,
    runExitCode: runPayload.runExitCode,
    durationMs: runPayload.durationMs,
    errorMessage: runPayload.errorMessage,
  });

  const [ins] = await pool.query(
    `INSERT INTO code_run_results
      (job_id, compile_exit_code, run_exit_code, compile_log, stdout, stderr,
       timed_out, duration_ms, entry_file_found, summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      jobId,
      runPayload.compileExitCode,
      runPayload.runExitCode,
      runPayload.compileLog,
      runPayload.stdout,
      runPayload.stderr,
      runPayload.timedOut ? 1 : 0,
      runPayload.durationMs,
      runPayload.entryFileFound ? 1 : 0,
      summary.slice(0, 500),
    ]
  );

  await pool.query(
    `UPDATE code_run_jobs SET
       status = ?, message = ?, error_message = ?, finished_at = NOW()
     WHERE id = ?`,
    [
      finalStatus,
      summary.slice(0, 500),
      runPayload.errorMessage ? String(runPayload.errorMessage).slice(0, 480) : null,
      jobId,
    ]
  );

  const resultId = ins.insertId;
  await linkJobResultToScope(jobId, resultId, summary);
  return { resultId, summary };
}

async function linkJobResultToScope(jobId, resultId, summary) {
  const job = await getJob(jobId);
  if (!job) return;

  if (job.submission_id) {
    const updates = [`code_run_result_id = ?`, `code_run_summary = ?`];
    const params = [resultId, summary.slice(0, 500)];
    if (job.code_hash) {
      updates.push('code_run_bound_hash = ?');
      params.push(job.code_hash);
    }
    params.push(job.submission_id);
    await pool.query(
      `UPDATE submissions SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
  }

  if (job.practice_attempt_id) {
    await pool.query(
      `UPDATE online_practice_attempts SET last_code_run_result_id = ? WHERE id = ?`,
      [resultId, job.practice_attempt_id]
    );
  }
}

async function markJobFailed(jobId, message, status = 'failed') {
  await pool.query(
    `UPDATE code_run_jobs SET
       status = ?, error_message = ?, message = ?, finished_at = NOW()
     WHERE id = ? AND status IN ('pending', 'running')`,
    [status, message.slice(0, 480), message.slice(0, 500), jobId]
  );

  const job = await getJob(jobId);
  if (job?.submission_id) {
    await pool.query(
      `UPDATE submissions SET code_run_summary = ? WHERE id = ?`,
      [message.slice(0, 500), job.submission_id]
    );
  }
}

async function processCodeRunJob(jobId) {
  const job = await getJob(jobId);
  if (!job) {
    console.warn('[codeRunProcessor] job not found', jobId);
    return;
  }
  if (job.status !== 'pending') {
    return;
  }

  const claimed = await claimJob(jobId);
  if (!claimed) return;

  let jobDirAbs;
  try {
    if (!isLanguageSupported(job.language)) {
      await markJobFailed(jobId, `不支持的语言: ${job.language}`);
      return;
    }
    if (!job.job_dir) {
      await markJobFailed(jobId, '缺少 job_dir');
      return;
    }

    jobDirAbs = resolveJobDir(job.job_dir);
    const run = getRunnerAdapter();
    const payload = await run({
      jobDirAbs,
      language: job.language,
      timeoutSec: job.timeout_sec,
    });

    const outcome = classifyRunOutcome(payload);
    const finalStatus = outcome.status;
    const errDetail =
      payload.stderr || payload.compileLog || payload.errorMessage || outcome.errorKind;
    payload.errorMessage = formatErrorMessage(outcome.errorKind, errDetail);

    await saveResult(jobId, payload, finalStatus);
  } catch (e) {
    console.error('[codeRunProcessor] job error', jobId, e.message || e);
    await markJobFailed(jobId, e.message || '运行异常');
  } finally {
    if (job && job.job_dir) {
      await cleanupJobDir(job.job_dir);
    }
  }
}

async function recoverStaleRunningJobs() {
  const [stale] = await pool.query(
    `
    SELECT id FROM code_run_jobs
    WHERE status = 'running'
      AND started_at IS NOT NULL
      AND started_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
  `,
    [STALE_RUNNING_MINUTES]
  );

  for (const row of stale) {
    await markJobFailed(row.id, STALE_FAIL_MSG, 'failed');
    const job = await getJob(row.id);
    if (job && job.job_dir) {
      await cleanupJobDir(job.job_dir);
    }
  }

  if (stale.length) {
    console.warn(`[codeRunProcessor] recovered ${stale.length} stale running job(s)`);
  }
  return stale.length;
}

module.exports = {
  processCodeRunJob,
  recoverStaleRunningJobs,
};
