/**
 * 五语言 job_dir 执行核心（Docker / Host 共用）
 */
const path = require('path');
const fs = require('fs').promises;
const { getMaxOutputBytes } = require('../utils/codeRunConfig');
const { getEntryFile, getLanguagePlan } = require('../utils/codeRunLanguageSpec');
const { hasStdinFile } = require('../utils/codeRunJobPaths');

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function mergeOutput(stdout, stderr) {
  return [stdout, stderr].filter(Boolean).join('\n').trim();
}

function missingEntryPayload(entry) {
  return {
    compileExitCode: null,
    runExitCode: null,
    compileLog: null,
    stdout: '',
    stderr: `未找到入口文件 ${entry}`,
    timedOut: false,
    durationMs: 0,
    entryFileFound: false,
    errorKind: 'entry_missing',
    errorMessage: 'entry_missing',
  };
}

function buildRunShell(language, timeoutSec, useStdin, platform, useShellTimeout) {
  const plan = getLanguagePlan(language);
  const isWin = platform === 'win32';
  const runBin = isWin && plan.runCmdWin ? plan.runCmdWin : plan.runCmd;
  const stdinSuffix = useStdin ? ' < stdin.txt' : '';
  if (useShellTimeout) {
    return `timeout ${timeoutSec}s ${runBin}${stdinSuffix}`;
  }
  return `${runBin}${stdinSuffix}`;
}

function buildCompileShell(language, timeoutSec, useShellTimeout) {
  const plan = getLanguagePlan(language);
  if (!useShellTimeout) return plan.compileCmd;
  return `timeout ${timeoutSec}s ${plan.compileCmd}`;
}

/**
 * @param {object} ctx { jobDirAbs, language, timeoutSec }
 * @param {object} runner { run(shellCommand, opts) } opts: { cwd, timeoutMs, maxOutputBytes, env }
 */
async function executeLanguageJob(ctx, runner) {
  const { jobDirAbs, language, timeoutSec } = ctx;
  const entry = getEntryFile(language);
  const plan = getLanguagePlan(language);
  if (!entry || !plan) {
    return {
      compileExitCode: null,
      runExitCode: null,
      compileLog: null,
      stdout: '',
      stderr: `不支持的语言: ${language}`,
      timedOut: false,
      durationMs: 0,
      entryFileFound: false,
      errorKind: 'runtime_error',
      errorMessage: `unsupported_language:${language}`,
    };
  }

  const entryPath = path.join(jobDirAbs, entry);
  if (!(await fileExists(entryPath))) {
    return missingEntryPayload(entry);
  }

  const useStdin = await hasStdinFile(jobDirAbs);
  const maxOutputBytes = getMaxOutputBytes();
  const started = Date.now();
  const platform = runner.executionPlatform || process.platform;
  const useShellTimeout = runner.useShellTimeout !== false;
  const compileBudgetMs = (timeoutSec + 10) * 1000;
  const runBudgetMs = (timeoutSec + 3) * 1000;

  if (plan.compiled) {
    const compile = await runner.run(buildCompileShell(language, timeoutSec, useShellTimeout), {
      cwd: jobDirAbs,
      timeoutMs: compileBudgetMs,
      maxOutputBytes,
    });

    const compileLog = mergeOutput(compile.stdout, compile.stderr);
    if (compile.timedOut) {
      return {
        compileExitCode: null,
        runExitCode: null,
        compileLog,
        stdout: compile.stdout,
        stderr: compile.stderr,
        timedOut: true,
        durationMs: Date.now() - started,
        entryFileFound: true,
        errorKind: 'timeout',
        errorMessage: 'timeout',
      };
    }
    if (compile.exitCode !== 0) {
      return {
        compileExitCode: compile.exitCode,
        runExitCode: null,
        compileLog,
        stdout: compile.stdout,
        stderr: compile.stderr,
        timedOut: false,
        durationMs: Date.now() - started,
        entryFileFound: true,
        errorKind: 'compile_error',
        errorMessage: 'compile_error',
      };
    }

    const runShell = buildRunShell(language, timeoutSec, useStdin, platform, useShellTimeout);
    const run = await runner.run(runShell, {
      cwd: jobDirAbs,
      timeoutMs: runBudgetMs,
      maxOutputBytes,
    });

    return {
      compileExitCode: 0,
      runExitCode: run.timedOut ? null : run.exitCode,
      compileLog,
      stdout: run.stdout,
      stderr: run.stderr,
      timedOut: run.timedOut,
      durationMs: Date.now() - started,
      entryFileFound: true,
      errorKind: run.timedOut
        ? 'timeout'
        : run.exitCode !== 0
          ? 'runtime_error'
          : null,
      errorMessage: run.timedOut
        ? 'timeout'
        : run.exitCode !== 0
          ? 'runtime_error'
          : undefined,
    };
  }

  const runShell = buildRunShell(language, timeoutSec, useStdin, platform, useShellTimeout);
  const run = await runner.run(runShell, {
    cwd: jobDirAbs,
    timeoutMs: runBudgetMs,
    maxOutputBytes,
  });

  return {
    compileExitCode: null,
    runExitCode: run.timedOut ? null : run.exitCode,
    compileLog: null,
    stdout: run.stdout,
    stderr: run.stderr,
    timedOut: run.timedOut,
    durationMs: Date.now() - started,
    entryFileFound: true,
    errorKind: run.timedOut ? 'timeout' : run.exitCode !== 0 ? 'runtime_error' : null,
    errorMessage: run.timedOut ? 'timeout' : run.exitCode !== 0 ? 'runtime_error' : undefined,
  };
}

module.exports = {
  executeLanguageJob,
  missingEntryPayload,
  buildRunShell,
  buildCompileShell,
};
