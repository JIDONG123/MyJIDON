/**
 * Docker 模式五语言执行（独立 job 目录 + timeout + 输出截断）
 */
const path = require('path');
const { runWithLimits } = require('../utils/processRunner');
const { getDockerImage } = require('../utils/codeRunConfig');
const { isLanguageSupported } = require('../utils/codeRunLanguageSpec');
const { executeLanguageJob } = require('./languageRunnerCore');

function toDockerVolumePath(absPath) {
  const resolved = path.resolve(absPath);
  if (process.platform === 'win32') {
    const normalized = resolved.replace(/\\/g, '/');
    if (/^[A-Za-z]:\//.test(normalized)) {
      return `/${normalized[0].toLowerCase()}${normalized.slice(2)}`;
    }
  }
  return resolved;
}

function createDockerRunner(language, jobDirAbs) {
  const image = getDockerImage(language);
  const vol = toDockerVolumePath(jobDirAbs);

  return {
    useShellTimeout: false,
    executionPlatform: 'linux',
    async run(shellCommand, opts) {
      const dockerArgs = [
        'run',
        '--rm',
        '--network',
        'none',
        '--memory',
        '512m',
        '--cpus',
        '1',
        '-v',
        `${vol}:/work:rw`,
        '-w',
        '/work',
        image,
        'sh',
        '-c',
        shellCommand,
      ];
      return runWithLimits('docker', dockerArgs, {
        timeoutMs: opts.timeoutMs,
        maxOutputBytes: opts.maxOutputBytes,
      });
    },
  };
}

async function runInDocker(ctx) {
  const { jobDirAbs, language, timeoutSec } = ctx;
  if (!isLanguageSupported(language)) {
    return {
      compileExitCode: null,
      runExitCode: null,
      compileLog: null,
      stdout: '',
      stderr: `Docker 模式不支持语言: ${language}`,
      timedOut: false,
      durationMs: 0,
      entryFileFound: false,
      errorKind: 'runtime_error',
      errorMessage: `unsupported_language:${language}`,
    };
  }

  const runner = createDockerRunner(language, jobDirAbs);
  return executeLanguageJob(ctx, runner);
}

module.exports = { runInDocker, toDockerVolumePath };
