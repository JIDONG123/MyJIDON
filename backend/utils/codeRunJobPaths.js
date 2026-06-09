/**
 * Code Runner 独立 job 目录：创建、写源码、清理
 */
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { ensureJobsRootExists } = require('./codeRunConfig');
const { getEntryFile } = require('./codeRunLanguageSpec');

function resolveJobDir(relativeDir) {
  const root = ensureJobsRootExists();
  const rel = String(relativeDir || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.includes('..')) {
    throw new Error('非法 job_dir');
  }
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root)) {
    throw new Error('job_dir 越界');
  }
  return abs;
}

async function allocateJobDir(jobId) {
  const root = ensureJobsRootExists();
  const rel = String(jobId);
  const abs = path.join(root, rel);
  await fsp.mkdir(abs, { recursive: true, mode: 0o700 });
  return { relative: rel, absolute: abs };
}

async function writeInlineJobFiles(jobDirAbs, language, sourceCode, stdin) {
  const entry = getEntryFile(language);
  if (!entry) throw new Error(`不支持的语言: ${language}`);
  await fsp.writeFile(path.join(jobDirAbs, entry), String(sourceCode || ''), { mode: 0o600 });
  if (stdin != null && String(stdin).length > 0) {
    await fsp.writeFile(path.join(jobDirAbs, 'stdin.txt'), String(stdin), { mode: 0o600 });
  }
}

async function hasStdinFile(jobDirAbs) {
  try {
    await fsp.access(path.join(jobDirAbs, 'stdin.txt'), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function cleanupJobDir(relativeDir) {
  if (!relativeDir) return;
  try {
    const abs = resolveJobDir(relativeDir);
    await fsp.rm(abs, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

module.exports = {
  resolveJobDir,
  allocateJobDir,
  writeInlineJobFiles,
  hasStdinFile,
  cleanupJobDir,
};
