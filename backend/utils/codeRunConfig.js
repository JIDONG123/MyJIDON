/**
 * Code Runner Worker 环境配置（Express 主进程仅读取开关，不执行学生代码）
 */
const fs = require('fs');
const path = require('path');

function isTruthy(v) {
  return v === '1' || v === 'true' || v === 'yes';
}

function isCodeRunnerEnabled() {
  return isTruthy(process.env.CODE_RUNNER_ENABLED);
}

function getRunnerMode() {
  const m = (process.env.CODE_RUNNER_MODE || 'docker').trim().toLowerCase();
  return m === 'host' ? 'host' : 'docker';
}

function getJobsRoot() {
  const raw = (process.env.CODE_RUNNER_JOBS_ROOT || '').trim();
  if (raw) return path.resolve(raw);
  if (process.platform === 'win32') {
    return path.join(require('os').tmpdir(), 'smart-grading-code-runner-jobs');
  }
  return '/var/lib/smart-grading/code-runner/jobs';
}

function getRunnerUser() {
  return (process.env.CODE_RUNNER_USER || 'code_runner').trim() || 'code_runner';
}

function getDefaultTimeoutSec() {
  const n = parseInt(process.env.CODE_RUNNER_DEFAULT_TIMEOUT_SEC || '10', 10);
  return Math.min(60, Math.max(2, Number.isFinite(n) ? n : 10));
}

function getMaxOutputBytes() {
  const n = parseInt(process.env.CODE_RUNNER_MAX_OUTPUT_BYTES || '65536', 10);
  return Math.min(512 * 1024, Math.max(4096, Number.isFinite(n) ? n : 65536));
}

function getStaleMinutes() {
  const n = parseInt(process.env.CODE_RUNNER_STALE_MINUTES || '10', 10);
  return Math.max(3, Number.isFinite(n) ? n : 10);
}

function getBrpopSec() {
  const n = parseInt(process.env.CODE_RUNNER_BRPOP_SEC || '5', 10);
  return Math.min(30, Math.max(1, Number.isFinite(n) ? n : 5));
}

function getDockerImage(language) {
  const key = `CODE_RUNNER_IMAGE_${String(language || 'python').toUpperCase()}`;
  const defaults = {
    python: 'python:3.11-slim',
    node: 'node:20-slim',
    c: 'gcc:13',
    cpp: 'gcc:13',
    java: 'eclipse-temurin:21-jdk',
  };
  return (process.env[key] || defaults[language] || defaults.python).trim();
}

function ensureJobsRootExists() {
  const root = getJobsRoot();
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  return root;
}

module.exports = {
  isCodeRunnerEnabled,
  getRunnerMode,
  getJobsRoot,
  ensureJobsRootExists,
  getRunnerUser,
  getDefaultTimeoutSec,
  getMaxOutputBytes,
  getStaleMinutes,
  getBrpopSec,
  getDockerImage,
};
