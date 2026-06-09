/**
 * 解析 tasks.code_run_config JSON
 */
const { getDefaultTimeoutSec } = require('./codeRunConfig');
const { validateTaskCodeRunLanguage, getEntryFile } = require('./codeRunLanguageSpec');

function parseJsonField(val) {
  if (val == null) return {};
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return {};
  }
}

function parseTaskCodeRunConfig(raw) {
  const cfg = parseJsonField(raw);
  const timeoutRaw = cfg.timeout_sec ?? cfg.timeoutSec;
  const timeoutSec = Math.min(
    60,
    Math.max(2, Number(timeoutRaw) || getDefaultTimeoutSec())
  );
  return {
    timeoutSec,
    entryFile:
      String(cfg.entry_file ?? cfg.entryFile ?? getEntryFile('python') ?? 'main.py').trim() ||
      'main.py',
    gradeAfterRun: Boolean(
      cfg.grade_after_run ?? cfg.gradeAfterRun ?? false
    ),
    /** 提交前必须完成代码运行检查 */
    runRequired: Boolean(cfg.run_required ?? cfg.runRequired ?? false),
    /** run_success_required | run_required_only */
    runPolicy: String(cfg.run_policy ?? cfg.runPolicy ?? 'run_required_only').toLowerCase(),
    stdin: cfg.stdin != null && String(cfg.stdin).length > 0 ? String(cfg.stdin) : null,
  };
}

function validateTaskCodeRunLanguageForApi(language) {
  return validateTaskCodeRunLanguage(language);
}

function normalizeTaskCodeRunInput(body) {
  const enabled = Boolean(body?.codeRunEnabled ?? body?.code_run_enabled);
  if (!enabled) {
    return { enabled: 0, language: null, configJson: null };
  }

  const language = String(body?.codeRunLanguage ?? body?.code_run_language ?? 'python')
    .toLowerCase()
    .trim();
  const langCheck = validateTaskCodeRunLanguage(language);
  if (!langCheck.ok) {
    return { error: langCheck.message };
  }
  const cfg = parseTaskCodeRunConfig(body?.codeRunConfig ?? body?.code_run_config ?? {});
  const timeoutSec = Math.min(
    60,
    Math.max(
      2,
      Number(body?.codeRunTimeoutSec ?? body?.code_run_timeout_sec) || cfg.timeoutSec
    )
  );
  const gradeAfterRun = Boolean(
    body?.codeRunGradeAfterRun ??
      body?.code_run_grade_after_run ??
      cfg.gradeAfterRun
  );
  const entryFile =
    String(body?.codeRunEntryFile ?? body?.code_run_entry_file ?? cfg.entryFile).trim() ||
    'main.py';
  const stdin =
    body?.codeRunStdin != null
      ? String(body.codeRunStdin)
      : body?.code_run_stdin != null
        ? String(body.code_run_stdin)
        : cfg.stdin;

  const configJson = JSON.stringify({
    timeout_sec: timeoutSec,
    entry_file: entryFile,
    grade_after_run: gradeAfterRun,
    stdin: stdin && stdin.length ? stdin : null,
  });

  return { enabled: 1, language: langCheck.language, configJson };
}

module.exports = {
  parseTaskCodeRunConfig,
  normalizeTaskCodeRunInput,
  validateTaskCodeRunLanguageForApi,
};
