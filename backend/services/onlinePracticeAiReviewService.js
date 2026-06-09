/**
 * 在线实训 AI 代码点评（Phase F1）
 * 严格隔离：不写 grading_results / grading_jobs / submissions 成绩字段
 */
const crypto = require('crypto');
const pool = require('../config/database');
const { chatCompletion, getSystemConfigs } = require('../utils/llmClient');
const { buildAiReviewMessages } = require('../utils/onlinePracticeAiReviewPrompt');
const { parseAiReviewFromLlmText } = require('../utils/onlinePracticeAiReviewNormalize');
const {
  isOnlinePracticeAiReviewEnabled,
  getAiReviewTimeoutMs,
  getAiReviewCooldownSec,
} = require('../utils/onlinePracticeAiReviewConfig');
const { getEntryFile } = require('../utils/codeRunLanguageSpec');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function parseJsonField(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

function formatReviewRow(row) {
  if (!row) return null;
  const review = parseJsonField(row.review_json);
  return {
    reviewId: row.id,
    attemptId: row.attempt_id,
    templateId: row.template_id,
    codeRunResultId: row.code_run_result_id,
    styleScore: row.style_score,
    status: row.status,
    errorMessage: row.error_message,
    review: review || null,
    basedOn: parseJsonField(row.run_snapshot_json),
    modelName: row.model_name,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
    disclaimer: '代码规范参考分，不计入正式成绩报告',
  };
}

function templateAiReviewEnabled(row) {
  if (!row) return false;
  return Number(row.ai_review_enabled) !== 0;
}

function effectiveAiReviewEnabled(templateRow) {
  return isOnlinePracticeAiReviewEnabled() && templateAiReviewEnabled(templateRow);
}

async function getAttemptRow(id) {
  const [rows] = await pool.query('SELECT * FROM online_practice_attempts WHERE id = ?', [id]);
  return rows[0] || null;
}

async function getTemplateRow(id) {
  const [rows] = await pool.query('SELECT * FROM online_practice_templates WHERE id = ?', [id]);
  return rows[0] || null;
}

async function assertStudentOwnsAttempt(studentId, attemptId) {
  const attempt = await getAttemptRow(attemptId);
  if (!attempt) throw httpError(404, '练习实例不存在');
  if (Number(attempt.student_id) !== Number(studentId)) {
    throw httpError(403, '无权访问该练习实例');
  }
  return attempt;
}

async function loadCodeRunResultForAttempt(attemptId, resultId) {
  const [rows] = await pool.query(
    `SELECT r.*, j.id AS job_id, j.status AS job_status, j.practice_attempt_id
     FROM code_run_results r
     INNER JOIN code_run_jobs j ON j.id = r.job_id
     WHERE r.id = ? AND j.practice_attempt_id = ?`,
    [resultId, attemptId]
  );
  return rows[0] || null;
}

const ALLOWED_JOB_STATUSES = new Set(['completed', 'failed', 'timeout']);

async function resolveCodeRunResult(attempt, codeRunResultId) {
  const rid = codeRunResultId != null ? Number(codeRunResultId) : Number(attempt.last_code_run_result_id);
  if (!Number.isFinite(rid) || rid <= 0) {
    throw httpError(400, '请先运行代码后再使用 AI 点评（需要至少一次运行结果）');
  }
  const row = await loadCodeRunResultForAttempt(attempt.id, rid);
  if (!row) {
    throw httpError(400, '运行结果不存在或不属于当前练习');
  }
  if (!ALLOWED_JOB_STATUSES.has(row.job_status)) {
    throw httpError(400, '请等待代码运行结束后再进行 AI 点评');
  }
  return row;
}

async function checkCooldown(attemptId) {
  const sec = getAiReviewCooldownSec();
  if (sec <= 0) return;
  const [rows] = await pool.query(
    `SELECT id, created_at FROM online_practice_ai_reviews
     WHERE attempt_id = ? AND status IN ('completed','running','pending')
     ORDER BY id DESC LIMIT 1`,
    [attemptId]
  );
  if (!rows[0]) return;
  const elapsed = (Date.now() - new Date(rows[0].created_at).getTime()) / 1000;
  if (elapsed < sec) {
    throw httpError(429, `操作过于频繁，请 ${Math.ceil(sec - elapsed)} 秒后再试`);
  }
}

async function getAiReviewStatus() {
  const cfg = await getSystemConfigs(['llm_api_base', 'llm_api_key']);
  const llmConfigured = Boolean((cfg.llm_api_base || '').trim() && (cfg.llm_api_key || '').trim());
  return {
    globalEnabled: isOnlinePracticeAiReviewEnabled(),
    llmConfigured,
  };
}

async function getLatestReview(attemptId, studentId) {
  await assertStudentOwnsAttempt(studentId, attemptId);
  const [rows] = await pool.query(
    `SELECT * FROM online_practice_ai_reviews
     WHERE attempt_id = ? AND student_id = ? AND status = 'completed'
     ORDER BY id DESC LIMIT 1`,
    [attemptId, studentId]
  );
  if (!rows[0]) return null;
  return formatReviewRow(rows[0]);
}

async function createAiReview(attemptId, studentId, body = {}) {
  if (!isOnlinePracticeAiReviewEnabled()) {
    throw httpError(503, '在线实训 AI 代码点评未启用（ONLINE_PRACTICE_AI_REVIEW_ENABLED=0）');
  }

  const attempt = await assertStudentOwnsAttempt(studentId, attemptId);
  const template = await getTemplateRow(attempt.template_id);
  if (!template || template.status !== 'published') {
    throw httpError(400, '练习未发布或已关闭');
  }
  if (!templateAiReviewEnabled(template)) {
    throw httpError(403, '教师未为本练习启用 AI 代码点评');
  }

  const cfg = await getSystemConfigs(['llm_api_base', 'llm_api_key', 'llm_model']);
  if (!(cfg.llm_api_base || '').trim() || !(cfg.llm_api_key || '').trim()) {
    throw httpError(503, '大模型未配置，请联系管理员在系统设置中配置 LLM API');
  }

  await checkCooldown(attemptId);

  const resultRow = await resolveCodeRunResult(attempt, body.codeRunResultId);
  const sourceCode = String(attempt.source_code || '').trim();
  if (!sourceCode) {
    throw httpError(400, '源代码为空，无法点评');
  }
  if (sourceCode.length > 96000) {
    throw httpError(400, '源代码过长，请精简后再试');
  }

  const cfgJson = parseJsonField(template.config_json) || {};
  const entryFile = cfgJson.entry_file || getEntryFile(template.language) || 'main.py';

  const runSnapshot = {
    summary: resultRow.summary,
    compileExitCode: resultRow.compile_exit_code,
    runExitCode: resultRow.run_exit_code,
    stdout: resultRow.stdout,
    stderr: resultRow.stderr,
    compileLog: resultRow.compile_log,
    durationMs: resultRow.duration_ms,
    timedOut: Boolean(resultRow.timed_out),
    jobStatus: resultRow.job_status,
  };

  const [ins] = await pool.query(
    `INSERT INTO online_practice_ai_reviews
      (attempt_id, template_id, student_id, code_run_result_id, code_run_job_id,
       language, entry_file, task_description, source_code, source_code_sha256,
       run_snapshot_json, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')`,
    [
      attempt.id,
      template.id,
      studentId,
      resultRow.id,
      resultRow.job_id,
      template.language,
      entryFile,
      template.description,
      sourceCode,
      sha256(sourceCode),
      JSON.stringify(runSnapshot),
    ]
  );
  const reviewId = ins.insertId;
  const started = Date.now();

  try {
    const messages = buildAiReviewMessages({
      title: template.title,
      description: template.description,
      language: template.language,
      entryFile,
      sourceCode,
      runSnapshot,
    });

    const llmText = await chatCompletion(messages, {
      temperature: 0.25,
      max_tokens: 2048,
      timeoutMs: getAiReviewTimeoutMs(),
    });

    if (!llmText) {
      throw httpError(503, '大模型未返回有效内容，请稍后重试');
    }

    const review = parseAiReviewFromLlmText(llmText);
    if (!review) {
      throw httpError(502, 'AI 点评结果解析失败，请稍后重试');
    }

    const latencyMs = Date.now() - started;
    const modelName = (cfg.llm_model || 'gpt-3.5-turbo').trim();

    await pool.query(
      `UPDATE online_practice_ai_reviews SET
         review_json = ?, style_score = ?, status = 'completed',
         model_name = ?, latency_ms = ?, error_message = NULL, updated_at = NOW()
       WHERE id = ?`,
      [JSON.stringify(review), review.styleScore, modelName, latencyMs, reviewId]
    );

    await pool.query(
      'UPDATE online_practice_attempts SET last_ai_review_id = ?, updated_at = NOW() WHERE id = ?',
      [reviewId, attempt.id]
    );

    const [rows] = await pool.query('SELECT * FROM online_practice_ai_reviews WHERE id = ?', [reviewId]);
    return formatReviewRow(rows[0]);
  } catch (e) {
    const msg =
      e.name === 'TimeoutError' || e.name === 'AbortError'
        ? 'AI 点评超时，请稍后重试'
        : e.status
          ? e.message
          : e.message?.includes('LLM HTTP')
            ? '大模型服务暂时不可用，请稍后重试'
            : 'AI 点评失败，请稍后重试';

    await pool.query(
      `UPDATE online_practice_ai_reviews SET status = 'failed', error_message = ?, updated_at = NOW() WHERE id = ?`,
      [String(msg).slice(0, 500), reviewId]
    );

    if (e.status) throw e;
    throw httpError(502, msg);
  }
}

module.exports = {
  getAiReviewStatus,
  getLatestReview,
  createAiReview,
  effectiveAiReviewEnabled,
  templateAiReviewEnabled,
  formatReviewRow,
};
