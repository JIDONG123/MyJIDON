/**
 * AI 批改 workText 中的代码运行检查块（不改 JSON schema）
 */
const pool = require('../config/database');
const { getEntryFile } = require('./codeRunLanguageSpec');

const CODE_RUN_MARKER = '---------- 代码运行检查 ----------';

function truncateBlock(text, max = 8000) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…（输出已截断）`;
}

function formatCompileLine(result) {
  if (result.compile_exit_code == null) return '编译：无';
  if (result.compile_exit_code === 0) return '编译：成功 (exit 0)';
  return `编译：失败 (exit ${result.compile_exit_code})`;
}

function formatRunLine(result) {
  if (result.timed_out) return '运行：超时';
  if (result.run_exit_code == null) return '运行：未执行';
  return `运行：exit ${result.run_exit_code}，耗时 ${result.duration_ms || 0}ms`;
}

function formatConclusion(jobStatus, result) {
  if (jobStatus === 'timeout' || result?.timed_out) return '结论：运行超时';
  if (!result?.entry_file_found) return '结论：未找到入口文件';
  if (result.run_exit_code === 0 && !result.timed_out) return '结论：运行通过';
  if (result.run_exit_code != null) return `结论：运行失败 (exit ${result.run_exit_code})`;
  return `结论：${result?.summary || jobStatus || '未知'}`;
}

function formatCodeRunWorkTextBlock({ language, entryFile, jobStatus, result }) {
  const lang = language || 'python';
  const entry = entryFile || getEntryFile(lang) || 'main.py';
  const lines = [
    CODE_RUN_MARKER,
    `语言：${lang}`,
    `入口：${entry}`,
    formatCompileLine(result || {}),
    formatRunLine(result || {}),
  ];

  if (result?.stdout) {
    lines.push('标准输出：', truncateBlock(result.stdout));
  }
  if (result?.stderr) {
    lines.push('标准错误：', truncateBlock(result.stderr));
  }
  if (result?.compile_log) {
    lines.push('编译日志：', truncateBlock(result.compile_log));
  }

  lines.push(formatConclusion(jobStatus, result));
  return lines.join('\n');
}

async function loadSubmissionCodeRunContext(submissionId) {
  const [rows] = await pool.query(
    `
    SELECT s.code_run_result_id, s.code_run_summary,
           t.code_run_enabled, t.code_run_language, t.code_run_config,
           r.compile_exit_code, r.run_exit_code, r.compile_log, r.stdout, r.stderr,
           r.timed_out, r.duration_ms, r.entry_file_found, r.summary AS result_summary,
           j.status AS job_status, j.language AS job_language, j.error_message
    FROM submissions s
    INNER JOIN tasks t ON t.id = s.task_id
    LEFT JOIN code_run_results r ON r.id = s.code_run_result_id
    LEFT JOIN code_run_jobs j ON j.id = r.job_id
    WHERE s.id = ?
  `,
    [submissionId]
  );
  return rows[0] || null;
}

async function buildCodeRunWorkTextAppend(submissionId) {
  const ctx = await loadSubmissionCodeRunContext(submissionId);
  if (!ctx || !ctx.code_run_enabled) return '';

  if (ctx.code_run_result_id && ctx.job_status) {
    const { parseTaskCodeRunConfig } = require('./taskCodeRunConfig');
    const cfg = parseTaskCodeRunConfig(ctx.code_run_config);
    return formatCodeRunWorkTextBlock({
      language: ctx.job_language || ctx.code_run_language,
      entryFile: cfg.entryFile,
      jobStatus: ctx.job_status,
      result: {
        compile_exit_code: ctx.compile_exit_code,
        run_exit_code: ctx.run_exit_code,
        compile_log: ctx.compile_log,
        stdout: ctx.stdout,
        stderr: ctx.stderr,
        timed_out: Boolean(ctx.timed_out),
        duration_ms: ctx.duration_ms,
        entry_file_found: Boolean(ctx.entry_file_found),
        summary: ctx.result_summary || ctx.code_run_summary,
      },
    });
  }

  const [pending] = await pool.query(
    `
    SELECT status, message FROM code_run_jobs
    WHERE submission_id = ? AND status IN ('pending', 'running')
    ORDER BY id DESC LIMIT 1
  `,
    [submissionId]
  );
  if (pending[0]) {
    return `${CODE_RUN_MARKER}\n状态：${pending[0].status === 'running' ? '运行中' : '排队中'}\n${pending[0].message || ''}`.trim();
  }

  if (ctx.code_run_summary) {
    return `${CODE_RUN_MARKER}\n${ctx.code_run_summary}`;
  }

  return '';
}

async function assertSubmissionCodeRunReadyForGrading(submissionId) {
  const { ensureSubmissionCodeRunLinked } = require('../services/codeRunSubmissionService');
  await ensureSubmissionCodeRunLinked(submissionId);

  const ctx = await loadSubmissionCodeRunContext(submissionId);
  if (!ctx || !ctx.code_run_enabled) {
    return { ok: true };
  }

  const { parseTaskCodeRunConfig } = require('./taskCodeRunConfig');
  const cfg = parseTaskCodeRunConfig(ctx.code_run_config);
  if (!cfg.gradeAfterRun) {
    return { ok: true };
  }

  const [pending] = await pool.query(
    `
    SELECT id, status FROM code_run_jobs
    WHERE submission_id = ? AND status IN ('pending', 'running')
    ORDER BY id DESC LIMIT 1
  `,
    [submissionId]
  );
  if (pending[0]) {
    return {
      ok: false,
      status: 400,
      message: '代码运行检查尚未完成，请稍后再发起 AI 批改',
    };
  }

  if (!ctx.code_run_result_id) {
    return {
      ok: false,
      status: 400,
      message: '任务要求先完成代码运行检查，当前尚无运行结果',
    };
  }

  return { ok: true };
}

module.exports = {
  CODE_RUN_MARKER,
  formatCodeRunWorkTextBlock,
  loadSubmissionCodeRunContext,
  buildCodeRunWorkTextAppend,
  assertSubmissionCodeRunReadyForGrading,
};
