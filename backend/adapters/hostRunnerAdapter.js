/**
 * Host 模式五语言执行（runuser + timeout；Windows 开发 fallback）
 */
const path = require('path');
const fs = require('fs').promises;
const { runWithLimits } = require('../utils/processRunner');
const { getRunnerUser, getMaxOutputBytes } = require('../utils/codeRunConfig');
const { isLanguageSupported } = require('../utils/codeRunLanguageSpec');
const { executeLanguageJob } = require('./languageRunnerCore');

function isLinux() {
  return process.platform === 'linux';
}

function wrapHostShell(jobDirAbs, innerShell) {
  const runnerUser = getRunnerUser();
  if (isLinux()) {
    return {
      command: 'runuser',
      args: ['-u', runnerUser, '--', 'sh', '-c', `cd ${JSON.stringify(jobDirAbs)} && ${innerShell}`],
    };
  }
  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', innerShell],
      cwd: jobDirAbs,
    };
  }
  return {
    command: 'sh',
    args: ['-c', `cd ${JSON.stringify(jobDirAbs)} && ${innerShell}`],
  };
}

function createHostRunner(jobDirAbs) {
  return {
    useShellTimeout: isLinux(),
    executionPlatform: process.platform,
    async run(shellCommand, opts) {
      let cmd = shellCommand;
      if (process.platform === 'win32') {
        cmd = cmd.replace(/^timeout\s+\d+s\s+/, '');
      }
      const spec = wrapHostShell(jobDirAbs, cmd);
      let input;
      if (process.platform === 'win32' && shellCommand.includes('< stdin.txt')) {
        try {
          input = await fs.readFile(path.join(jobDirAbs, 'stdin.txt'), 'utf8');
        } catch {
          input = undefined;
        }
        cmd = cmd.replace(/\s*<\s*stdin\.txt\s*$/, '');
        spec.args = ['/d', '/s', '/c', cmd];
      }

      const r = await runWithLimits(spec.command, spec.args, {
        cwd: spec.cwd || opts.cwd,
        timeoutMs: opts.timeoutMs,
        maxOutputBytes: opts.maxOutputBytes || getMaxOutputBytes(),
        input,
        env: {
          ...process.env,
          PYTHONHASHSEED: '0',
          PYTHONUTF8: '1',
          PYTHONDONTWRITEBYTECODE: '1',
          LANG: 'C.UTF-8',
        },
      });

      const timedOut =
        r.timedOut || (r.stderr && String(r.stderr).includes('已超时')) || false;
      return { ...r, timedOut };
    },
  };
}

async function runOnHost(ctx) {
  const { language } = ctx;
  if (!isLanguageSupported(language)) {
    return {
      compileExitCode: null,
      runExitCode: null,
      compileLog: null,
      stdout: '',
      stderr: `Host 模式不支持语言: ${language}`,
      timedOut: false,
      durationMs: 0,
      entryFileFound: false,
      errorKind: 'runtime_error',
      errorMessage: `unsupported_language:${language}`,
    };
  }

  const runner = createHostRunner(ctx.jobDirAbs);
  return executeLanguageJob(ctx, runner);
}

module.exports = { runOnHost };
