/**
 * 从提交 zip / 单文件物化 job_dir（五语言入口文件）
 */
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');
const { writeInlineJobFiles } = require('../utils/codeRunJobPaths');
const {
  getEntryFile,
  getSourceExtensions,
  validatePythonSource,
} = require('../utils/codeRunLanguageSpec');
const { isZipSubmission } = require('./safeZipArchive');

function normalizeZipEntryName(name) {
  return String(name || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function isSafeRelativePath(name) {
  if (!name || name.includes('..') || name.startsWith('/')) return false;
  return true;
}

async function fileExists(p) {
  try {
    await fsp.access(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function matchesLanguageFile(base, language) {
  const lower = base.toLowerCase();
  return getSourceExtensions(language).some((ext) => lower.endsWith(ext));
}

async function ensureEntryFile(jobDirAbs, basenames, entryFile) {
  const entryPath = path.join(jobDirAbs, entryFile);
  if (await fileExists(entryPath)) return;

  const lowerMap = new Map(basenames.map((b) => [b.toLowerCase(), b]));
  const entryLower = entryFile.toLowerCase();
  if (lowerMap.has(entryLower)) {
    const src = path.join(jobDirAbs, lowerMap.get(entryLower));
    if (src !== entryPath) await fsp.copyFile(src, entryPath);
    return;
  }

  if (basenames.length === 1) {
    const src = path.join(jobDirAbs, basenames[0]);
    await fsp.rename(src, entryPath);
    return;
  }

  throw new Error(`未找到入口文件 ${entryFile}，请在压缩包内提供标准入口或仅含一个源码文件`);
}

async function materializeFromZip(zipPath, jobDirAbs, language, entryFile) {
  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    throw new Error('无法读取 ZIP 压缩包');
  }

  const basenames = [];
  const written = new Set();

  for (const entry of zip.getEntries()) {
    const name = normalizeZipEntryName(entry.entryName);
    if (!name || !isSafeRelativePath(name)) continue;
    if (entry.isDirectory) continue;
    const base = path.basename(name);
    if (!matchesLanguageFile(base, language)) continue;
    if (written.has(base.toLowerCase())) continue;

    const buf = entry.getData();
    if (!buf || buf.length > 512 * 1024) {
      throw new Error(`源码文件过大: ${base}`);
    }
    await fsp.writeFile(path.join(jobDirAbs, base), buf, { mode: 0o600 });
    written.add(base.toLowerCase());
    basenames.push(base);
  }

  if (!basenames.length) {
    throw new Error(`压缩包中未找到 ${language} 源码文件`);
  }

  await ensureEntryFile(jobDirAbs, basenames, entryFile);
}

function singleFileExtension(language) {
  const exts = getSourceExtensions(language);
  return exts[0] || null;
}

async function materializeSubmissionJobDir(submission, language, taskConfig) {
  const defaultEntry = getEntryFile(language);
  const entryFile = taskConfig.entryFile || defaultEntry;
  const { file_path: filePath, file_name: fileName, file_type: fileType, code_content: codeContent } =
    submission;
  const jobDirAbs = submission._jobDirAbs;

  const inlineCode = codeContent != null ? String(codeContent).trim() : '';
  if (inlineCode) {
    if (language === 'python') {
      const v = validatePythonSource(inlineCode);
      if (!v.ok) throw new Error(v.reason);
    }
    await writeInlineJobFiles(jobDirAbs, language, inlineCode, taskConfig.stdin);
    if (entryFile !== defaultEntry) {
      const defaultPath = path.join(jobDirAbs, defaultEntry);
      const customPath = path.join(jobDirAbs, entryFile);
      if ((await fileExists(defaultPath)) && defaultEntry !== entryFile) {
        await fsp.copyFile(defaultPath, customPath);
      }
    }
    return;
  }

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('提交缺少可运行的代码：请在代码内容区填写代码，或上传源码附件');
  }

  if (isZipSubmission(fileName, fileType)) {
    await materializeFromZip(filePath, jobDirAbs, language, entryFile);
    if (taskConfig.stdin) {
      await fsp.writeFile(path.join(jobDirAbs, 'stdin.txt'), taskConfig.stdin, { mode: 0o600 });
    }
    return;
  }

  const ext = singleFileExtension(language);
  if (ext && fileName && fileName.toLowerCase().endsWith(ext)) {
    const src = await fsp.readFile(filePath, 'utf8');
    if (language === 'python') {
      const v = validatePythonSource(src);
      if (!v.ok) throw new Error(v.reason);
    }
    await writeInlineJobFiles(jobDirAbs, language, src, taskConfig.stdin);
    if (entryFile !== defaultEntry) {
      const defaultPath = path.join(jobDirAbs, defaultEntry);
      const customPath = path.join(jobDirAbs, entryFile);
      if ((await fileExists(defaultPath)) && defaultEntry !== entryFile) {
        await fsp.copyFile(defaultPath, customPath);
      }
    }
    return;
  }

  throw new Error(`请提交 ${ext || '源码'} 文件或含对应源码的 zip 压缩包`);
}

module.exports = {
  materializeSubmissionJobDir,
  materializeFromZip,
  ensureEntryFile,
};
