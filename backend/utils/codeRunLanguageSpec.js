/**
 * 五语言 Code Runner 执行计划与结果归类
 */
const ENTRY_FILES = {
  python: 'main.py',
  node: 'main.js',
  c: 'main.c',
  cpp: 'main.cpp',
  java: 'Main.java',
};

const SUPPORTED_LANGUAGES = new Set(['python', 'node', 'c', 'cpp', 'java']);

/** 实训任务发布页允许的代码运行语言（与在线实训五语言一致） */
const TASK_ALLOWED_LANGUAGES = new Set(['python', 'node', 'c', 'cpp', 'java']);

const SOURCE_EXTENSIONS = {
  python: ['.py'],
  node: ['.js', '.mjs', '.cjs'],
  c: ['.c'],
  cpp: ['.cpp', '.cc', '.cxx'],
  java: ['.java'],
};

const LANGUAGE_PLANS = {
  python: {
    compiled: false,
    runCmd: 'python3 -I -B main.py',
    runCmdWin: 'python -I -B main.py',
  },
  node: {
    compiled: false,
    runCmd: 'node main.js',
    runCmdWin: 'node main.js',
  },
  c: {
    compiled: true,
    compileCmd: 'gcc -std=c11 -O0 -o main main.c',
    runCmd: './main',
    runCmdWin: 'main.exe',
  },
  cpp: {
    compiled: true,
    compileCmd: 'g++ -std=c++17 -O0 -o main main.cpp',
    runCmd: './main',
    runCmdWin: 'main.exe',
  },
  java: {
    compiled: true,
    compileCmd: 'javac -encoding UTF-8 Main.java',
    runCmd: 'java Main',
    runCmdWin: 'java Main',
  },
};

/** Python 静态拦截（MVP，非完整沙箱） */
const PYTHON_FORBIDDEN = [
  /\bimport\s+os\b/i,
  /\bfrom\s+os\s+import\b/i,
  /\bimport\s+subprocess\b/i,
  /\bfrom\s+subprocess\s+import\b/i,
  /\bimport\s+socket\b/i,
  /\bimport\s+ctypes\b/i,
  /\beval\s*\(/i,
  /\bexec\s*\(/i,
  /\b__import__\s*\(/i,
  /\bopen\s*\(/i,
];

function getEntryFile(language) {
  return ENTRY_FILES[language] || null;
}

function getSourceExtensions(language) {
  return SOURCE_EXTENSIONS[language] || [];
}

function getLanguagePlan(language) {
  return LANGUAGE_PLANS[language] || null;
}

function isLanguageSupported(language) {
  return SUPPORTED_LANGUAGES.has(String(language || '').toLowerCase());
}

/** @deprecated 使用 isLanguageSupported */
function isLanguageSupportedInPhaseA(language) {
  return isLanguageSupported(language);
}

function validateTaskCodeRunLanguage(language) {
  const lang = String(language || 'python').toLowerCase().trim();
  if (!TASK_ALLOWED_LANGUAGES.has(lang)) {
    return {
      ok: false,
      message: `任务代码运行检查不支持的语言: ${lang}，可选 Python / Node.js / C / C++ / Java`,
    };
  }
  return { ok: true, language: lang };
}

function validatePythonSource(source) {
  const src = String(source || '');
  for (const re of PYTHON_FORBIDDEN) {
    if (re.test(src)) {
      return { ok: false, reason: `代码含受限调用（${re.source}）` };
    }
  }
  if (src.length > 96000) {
    return { ok: false, reason: '源代码过长' };
  }
  return { ok: true };
}

function buildSummary(result) {
  if (result.errorKind === 'entry_missing' || !result.entryFileFound) {
    return '未找到入口文件';
  }
  if (result.timedOut) return '运行超时';
  if (result.compileExitCode != null && result.compileExitCode !== 0) {
    return `编译失败 (exit ${result.compileExitCode})`;
  }
  if (result.runExitCode === 0) {
    return `运行通过 (exit 0, ${result.durationMs || 0}ms)`;
  }
  if (result.runExitCode != null) {
    return `运行失败 (exit ${result.runExitCode})`;
  }
  return result.errorMessage || '运行失败';
}

function classifyRunOutcome(payload) {
  if (!payload.entryFileFound) {
    return { status: 'failed', errorKind: 'entry_missing' };
  }
  if (payload.timedOut) {
    return { status: 'timeout', errorKind: 'timeout' };
  }
  if (payload.compileExitCode != null && payload.compileExitCode !== 0) {
    return { status: 'failed', errorKind: 'compile_error' };
  }
  if (payload.runExitCode != null && payload.runExitCode !== 0) {
    return { status: 'failed', errorKind: 'runtime_error' };
  }
  if (payload.runExitCode === 0) {
    return { status: 'completed', errorKind: null };
  }
  return { status: 'failed', errorKind: payload.errorKind || 'runtime_error' };
}

function formatErrorMessage(errorKind, detail) {
  if (!errorKind) return detail || null;
  const base = `[${errorKind}]`;
  if (!detail) return base;
  return `${base} ${detail}`.slice(0, 480);
}

module.exports = {
  ENTRY_FILES,
  SUPPORTED_LANGUAGES,
  TASK_ALLOWED_LANGUAGES,
  SOURCE_EXTENSIONS,
  LANGUAGE_PLANS,
  getEntryFile,
  getSourceExtensions,
  getLanguagePlan,
  isLanguageSupported,
  isLanguageSupportedInPhaseA,
  validateTaskCodeRunLanguage,
  validatePythonSource,
  buildSummary,
  classifyRunOutcome,
  formatErrorMessage,
};
