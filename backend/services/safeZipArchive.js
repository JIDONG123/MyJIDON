const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { extractTextFromBuffer } = require('./fileParser');

const ZIP_MAX_UPLOAD_BYTES = parseInt(process.env.ZIP_MAX_UPLOAD_BYTES || String(50 * 1024 * 1024), 10);
const ZIP_MAX_ENTRY_COUNT = parseInt(process.env.ZIP_MAX_ENTRY_COUNT || '400', 10);
const ZIP_MAX_UNCOMPRESSED_TOTAL = parseInt(
  process.env.ZIP_MAX_UNCOMPRESSED_TOTAL || String(100 * 1024 * 1024),
  10
);
const ZIP_MAX_ENTRY_UNCOMPRESSED = parseInt(
  process.env.ZIP_MAX_ENTRY_UNCOMPRESSED || String(20 * 1024 * 1024),
  10
);
/** 单条目压缩后体积过大仍拒绝，防止解压内存暴涨 */
const ZIP_MAX_ENTRY_COMPRESSED = parseInt(
  process.env.ZIP_MAX_ENTRY_COMPRESSED || String(25 * 1024 * 1024),
  10
);
/** 解压后总字符上限，防止超长文本拖垮内存 */
const ZIP_MAX_OUTPUT_CHARS = parseInt(process.env.ZIP_MAX_OUTPUT_CHARS || '1200000', 10);
/** 压缩比阈值：解压后/压缩后 过大视为可疑 */
const ZIP_MAX_COMPRESSION_RATIO = parseInt(process.env.ZIP_MAX_COMPRESSION_RATIO || '200', 10);

const ALLOW_EXT = new Set(
  [
    '.txt',
    '.js',
    '.mjs',
    '.cjs',
    '.vue',
    '.json',
    '.java',
    '.py',
    '.html',
    '.htm',
    '.css',
    '.scss',
    '.less',
    '.md',
    '.c',
    '.cpp',
    '.cc',
    '.h',
    '.hpp',
    '.go',
    '.php',
    '.rb',
    '.ts',
    '.tsx',
    '.jsx',
    '.rs',
    '.sql',
    '.sh',
    '.bat',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.pdf',
    '.xml',
    '.yaml',
    '.yml',
    '.properties',
    '.gradle',
    '.cs',
    '.kt',
    '.swift',
    '.ipynb',
    '.svelte',
    '.toml',
    '.ini',
    '.cfg',
    '.conf',
    '.log',
    '.svg',
    /** Node path.extname('.gitignore') 为 ''，以下为完整文件名形式的“扩展”匹配 */
    '.gitignore',
    '.dockerignore',
    '.editorconfig',
    '.npmignore',
    '.eslintignore',
    '.babelrc',
    '.prettierrc',
    '.stylelintrc',
  ].map((x) => x.toLowerCase())
);

/** path.extname 对 `.gitignore` 会得到 ''，用 basename 识别这类文本点文件 */
const ALLOW_DOTFILE_BASE = new Set([
  '.gitignore',
  '.dockerignore',
  '.editorconfig',
  '.npmignore',
  '.eslintignore',
  '.babelrc',
  '.prettierrc',
  '.stylelintrc',
  '.eslintrc',
]);

/** 无扩展名的常见工程文本文件（任意层级目录内） */
const ALLOW_BASENAME_NO_EXT = new Set([
  'makefile',
  'dockerfile',
  'containerfile',
  'gemfile',
  'rakefile',
  'procfile',
  'jenkinsfile',
  'license',
  'readme',
  'changelog',
  'contributing',
]);

const DENY_EXT = new Set(
  [
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.bin',
    '.msi',
    '.com',
    '.scr',
    '.deb',
    '.rpm',
    '.apk',
    '.jar',
    '.class',
    '.o',
    '.obj',
    '.lib',
    '.wasm',
    '.sys',
    '.efi',
    '.dmg',
    '.pkg',
    '.app',
  ].map((x) => x.toLowerCase())
);

function isZipSubmission(fileName, mimeType) {
  const ext = path.extname(fileName || '').toLowerCase();
  const m = String(mimeType || '').toLowerCase();
  return (
    ext === '.zip' ||
    m === 'application/zip' ||
    m === 'application/x-zip-compressed' ||
    (m === 'application/octet-stream' && ext === '.zip')
  );
}

function normalizeEntryName(entryName) {
  return String(entryName || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function isSafePath(entryName) {
  const n = normalizeEntryName(entryName);
  if (!n || n.length > 512) return false;
  const parts = n.split('/');
  if (parts.some((p) => p === '..')) return false;
  if (parts.some((p) => /^[a-zA-Z]:/.test(p))) return false;
  const low = n.toLowerCase();
  if (low.includes('..')) return false;
  if (low.startsWith('__macosx/')) return false;
  return true;
}

function isSensitiveDotFile(baseName) {
  const b = String(baseName || '').toLowerCase();
  return (
    b === '.env' ||
    b === '.env.local' ||
    b === '.npmrc' ||
    b === '.pypirc' ||
    b === '.ssh' ||
    b === 'id_rsa' ||
    b === 'id_ecdsa'
  );
}

function shouldSkipEntry(entryName) {
  const n = normalizeEntryName(entryName);
  const base = path.basename(n).toLowerCase();
  if (base === '.ds_store' || base === 'thumbs.db') return true;
  return false;
}

/** 目录占位条目（部分压缩工具 isDirectory 不可靠） */
function isDirectoryLike(entry, normalizedName) {
  if (entry.isDirectory) return true;
  const n = normalizedName;
  return n.endsWith('/') || n.endsWith('\\');
}

/**
 * 统一取出用于白名单判断的“扩展名”：
 * - 普通文件：.java / .vue
 * - 点号文件：.gitignore（path.extname 会得到 ''，改用整名）
 */
function effectiveExtension(base) {
  const b = base || '';
  const lower = b.toLowerCase();
  if (ALLOW_DOTFILE_BASE.has(lower)) {
    return lower;
  }
  const e = path.extname(b).toLowerCase();
  if (e) return e;
  return '';
}

function isAllowedBareTextBasename(base) {
  const lower = String(base || '').toLowerCase();
  if (ALLOW_BASENAME_NO_EXT.has(lower)) return true;
  if (lower.startsWith('dockerfile.') || lower.startsWith('makefile.') || lower.startsWith('readme')) {
    return true;
  }
  return false;
}

/**
 * @returns {Promise<{ ok: boolean, text?: string, fileCount?: number, message?: string, code?: string }>}
 */
async function extractSafeZipArchive(filePath, originalDisplayName) {
  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch (e) {
    return { ok: false, code: 'IO', message: '无法读取压缩包文件' };
  }

  if (stats.size > ZIP_MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      code: 'ZIP_TOO_LARGE',
      message: `压缩包超过大小限制（最大 ${Math.round(ZIP_MAX_UPLOAD_BYTES / 1024 / 1024)}MB）`,
    };
  }

  let zip;
  try {
    zip = new AdmZip(filePath);
  } catch (e) {
    return { ok: false, code: 'INVALID_ZIP', message: '无效的 ZIP 文件或已损坏' };
  }

  let entries;
  try {
    entries = zip.getEntries();
  } catch (e) {
    return { ok: false, code: 'ZIP_READ', message: '读取压缩包目录失败' };
  }

  if (entries.length > ZIP_MAX_ENTRY_COUNT) {
    return {
      ok: false,
      code: 'TOO_MANY_ENTRIES',
      message: `压缩包内文件过多（超过 ${ZIP_MAX_ENTRY_COUNT} 个），请精简后重新上传`,
    };
  }

  let totalUncompressed = 0;
  const sections = [];
  let fileCount = 0;
  let outputLen = 0;

  const sorted = [...entries].sort((a, b) =>
    normalizeEntryName(a.entryName).localeCompare(normalizeEntryName(b.entryName))
  );

  for (const entry of sorted) {
    try {
      const name = normalizeEntryName(entry.entryName);
      if (!name || shouldSkipEntry(name)) continue;
      if (!isSafePath(name)) continue;
      if (isDirectoryLike(entry, name)) continue;

      const base = path.basename(name);
      if (isSensitiveDotFile(base)) continue;

      const ext = effectiveExtension(base);
      const allowNoExt = !ext && isAllowedBareTextBasename(base);
      if (DENY_EXT.has(ext)) continue;
      if (ext === '.zip') continue;
      if (!allowNoExt) {
        if (!ext || !ALLOW_EXT.has(ext)) continue;
      }

      const ucSize = Number(entry.header.size) || 0;
      const cSize = Number(entry.header.compressedSize) || 0;
      if (ucSize > ZIP_MAX_ENTRY_UNCOMPRESSED || cSize > ZIP_MAX_ENTRY_COMPRESSED) {
        return {
          ok: false,
          code: 'ENTRY_TOO_LARGE',
          message: `压缩包内含超大文件「${base}」，超过单文件解压限制`,
        };
      }

      if (cSize > 0 && ucSize / cSize > ZIP_MAX_COMPRESSION_RATIO && ucSize > 512 * 1024) {
        return {
          ok: false,
          code: 'ZIP_BOMB_RATIO',
          message: '检测到异常的压缩比，疑似压缩炸弹，已拒绝解压',
        };
      }

      totalUncompressed += ucSize;
      if (totalUncompressed > ZIP_MAX_UNCOMPRESSED_TOTAL) {
        return {
          ok: false,
          code: 'TOTAL_UNCOMPRESSED',
          message: '解压后总体积过大，请减小压缩包内容后重试',
        };
      }

      let buf;
      try {
        buf = entry.getData();
      } catch (e) {
        sections.push(`\n=== FILE SKIPPED: ${name} (解压失败: ${e.message}) ===\n`);
        continue;
      }

      if (!Buffer.isBuffer(buf)) continue;
      if (buf.length > ZIP_MAX_ENTRY_UNCOMPRESSED) {
        return {
          ok: false,
          code: 'ENTRY_TOO_LARGE',
          message: `解压后文件「${base}」超出大小限制`,
        };
      }

      const mimeGuess =
        ext === '.pdf'
          ? 'application/pdf'
          : ext === '.docx'
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : ext === '.png'
              ? 'image/png'
              : 'application/octet-stream';

      let piece = '';
      try {
        if (allowNoExt) {
          piece = buf.toString('utf8').trim();
        } else {
          piece = await extractTextFromBuffer(buf, mimeGuess, base);
        }
      } catch (e) {
        piece = `[解析异常：${name}] ${e.message}`;
      }

      if (!piece || !String(piece).trim()) continue;

      const header = `\n\n======== FILE: ${name} ========\n`;
      const block = header + piece.trim() + '\n';
      if (outputLen + block.length > ZIP_MAX_OUTPUT_CHARS) {
        sections.push(
          `\n\n======== TRUNCATED ========\n已达到解析文本长度上限（${ZIP_MAX_OUTPUT_CHARS} 字符），后续文件已省略。\n`
        );
        break;
      }
      sections.push(block);
      outputLen += block.length;
      fileCount += 1;
    } catch (e) {
      console.warn('[safeZipArchive] entry skip:', e.message);
    }
  }

  const text = sections.join('').trim();
  return {
    ok: true,
    text,
    fileCount,
  };
}

module.exports = {
  isZipSubmission,
  extractSafeZipArchive,
};
