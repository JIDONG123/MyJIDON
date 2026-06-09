/**
 * 图片视觉识别编排：调用 Qwen3-VL-Plus，写入提交记录，合并进批改用文本。
 * 不修改 llmClient / embeddingClient / aiGrading / ragRetrieve。
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const pool = require('../config/database');
const {
  isVlConfigured,
  recognizeImageFile,
  recognizeImageBuffer,
  formatRecognitionForGrading,
  guessMime,
} = require('../utils/qwenVlClient');
const { getQwenVlConfig, isQwenVlConfigured } = require('./visionModelService');

const VL_MARKER = '---------- 图片视觉识别（Qwen-VL） ----------';
const IMAGE_PLACEHOLDER_RE = /\[图片文件：[^\]]+\]/;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);

function isImageSubmission(mimeType, fileName) {
  if (mimeType && String(mimeType).startsWith('image/')) return true;
  const ext = path.extname(fileName || '').toLowerCase();
  return IMAGE_EXT.has(ext);
}

function isImagePlaceholderText(text) {
  return IMAGE_PLACEHOLDER_RE.test(String(text || ''));
}

function emitVlProgress(meta, phase, extra = {}) {
  if (!meta) return;
  try {
    const rt = require('../utils/realtimeEmit');
    const action =
      phase === 'start'
        ? 'vl_start'
        : phase === 'done'
          ? 'vl_done'
          : phase === 'failed'
            ? 'vl_failed'
            : 'vl_progress';
    rt.emitGradingProgress({
      domain: 'grading',
      action,
      classId: meta.classId,
      taskId: meta.taskId,
      studentId: meta.studentId,
      submissionId: meta.submissionId,
      vlPhase: phase,
      ...extra,
    });
  } catch {
    /* ignore */
  }
}

/**
 * 将 VL 识别块并入 content / archive 文本（供向量检索与 DeepSeek 使用）
 */
function mergeRecognitionIntoText(baseText, recognitionPlain) {
  const base = String(baseText || '').trim();
  const block = String(recognitionPlain || '').trim();
  if (!block) return base;
  if (base.includes(VL_MARKER)) {
    const head = base.split(VL_MARKER)[0].trimEnd();
    return head ? `${head}\n\n${block}` : block;
  }
  if (!base) return block;
  return `${base}\n\n${block}`;
}

function replaceImagePlaceholder(text, fileLabel, recognitionPlain) {
  const label = fileLabel || '图片';
  const re = new RegExp(
    `\\[图片文件：[^\\]]*${escapeRegExp(label)}[^\\]]*\\][\\s\\S]*?(?=\\n\\n======== FILE:|\\n\\n======== TRUNCATED|$)`,
    'i'
  );
  const block = String(recognitionPlain || '').trim();
  if (re.test(text)) {
    return text.replace(re, block);
  }
  const simple = new RegExp(`\\[图片文件：[^\\]]*${escapeRegExp(label)}[^\\]]*\\]`, 'i');
  if (simple.test(text)) {
    return text.replace(simple, block);
  }
  return mergeRecognitionIntoText(text, block);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 单张图片文件识别（提交主附件）
 * @returns {Promise<{ ok: boolean, plainText?: string, structured?: object, status: string, message?: string }>}
 */
async function recognizeSubmissionImage(filePath, mimeType, fileName, progressMeta) {
  if (!isImageSubmission(mimeType, fileName)) {
    return { ok: true, status: 'skipped', message: '非图片附件' };
  }
  if (!(await isQwenVlConfigured()) && !isVlConfigured()) {
    return { ok: false, status: 'skipped', message: '未配置 Qwen-VL API Key，已跳过视觉识别' };
  }

  const vlConfig = await getQwenVlConfig();
  if (!vlConfig.enabled) {
    return { ok: false, status: 'skipped', message: 'Qwen-VL 图像识别未启用' };
  }
  if (!vlConfig.apiKey) {
    return { ok: false, status: 'skipped', message: '未配置 Qwen-VL API Key，已跳过视觉识别' };
  }

  emitVlProgress(progressMeta, 'start', { fileName });
  try {
    const { structured, plainText } = await recognizeImageFile(
      filePath,
      mimeType,
      fileName,
      vlConfig
    );
    emitVlProgress(progressMeta, 'done', { fileName });
    return {
      ok: true,
      status: 'done',
      plainText,
      structured,
      meta: { fileName, model: vlConfig.model },
    };
  } catch (e) {
    const message = e && e.message ? e.message : '视觉识别失败';
    emitVlProgress(progressMeta, 'failed', { fileName, message });
    return { ok: false, status: 'failed', message };
  }
}

/**
 * 对 fileParser 占位或图片类型提取结果尝试 VL 增强
 */
async function enhanceExtractedTextIfImage(
  filePath,
  mimeType,
  fileName,
  extractedText,
  progressMeta
) {
  if (!filePath || (!(await isQwenVlConfigured()) && !isVlConfigured())) {
    return { text: extractedText, vl: { status: 'skipped' } };
  }
  const needsVl =
    isImageSubmission(mimeType, fileName) || isImagePlaceholderText(extractedText);
  if (!needsVl) {
    return { text: extractedText, vl: { status: 'skipped' } };
  }

  const vl = await recognizeSubmissionImage(filePath, mimeType, fileName, progressMeta);
  if (!vl.ok || !vl.plainText) {
    return {
      text: extractedText,
      vl: { status: vl.status, message: vl.message },
    };
  }
  if (isImagePlaceholderText(extractedText)) {
    return {
      text: vl.plainText,
      vl: {
        status: 'done',
        plainText: vl.plainText,
        structured: vl.structured,
        meta: vl.meta,
      },
    };
  }
  return {
    text: mergeRecognitionIntoText(extractedText, vl.plainText),
    vl: {
      status: 'done',
      plainText: vl.plainText,
      structured: vl.structured,
      meta: vl.meta,
    },
  };
}

function normalizeZipEntryName(name) {
  return String(name || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

function isSafeZipPath(name) {
  if (!name || name.includes('..')) return false;
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return false;
  return true;
}

/**
 * 扫描 ZIP 内图片并追加 VL 识别（不修改 safeZipArchive 白名单逻辑）
 */
async function appendZipImagesVlRecognition(zipPath, archiveText, progressMeta) {
  const vlReady = (await isQwenVlConfigured()) || isVlConfigured();
  if (!zipPath || !fs.existsSync(zipPath) || !vlReady) {
    return { text: archiveText, vl: { status: 'skipped' } };
  }

  const vlConfig = await getQwenVlConfig();

  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    return { text: archiveText, vl: { status: 'skipped', message: '无法读取压缩包' } };
  }

  let entries;
  try {
    entries = zip.getEntries();
  } catch {
    return { text: archiveText, vl: { status: 'skipped' } };
  }

  let text = String(archiveText || '');
  const sections = [];
  const metas = [];
  let imageCount = 0;
  const maxZipImages = parseInt(process.env.QWEN_VL_MAX_ZIP_IMAGES || '8', 10);

  for (const entry of entries) {
    if (imageCount >= maxZipImages) break;
    const name = normalizeZipEntryName(entry.entryName);
    if (!name || entry.isDirectory || !isSafeZipPath(name)) continue;
    const base = path.basename(name);
    const ext = path.extname(base).toLowerCase();
    if (!IMAGE_EXT.has(ext)) continue;

    let buf;
    try {
      buf = entry.getData();
    } catch {
      continue;
    }
    if (!Buffer.isBuffer(buf) || !buf.length) continue;

    imageCount += 1;
    emitVlProgress(progressMeta, 'start', { fileName: name, zipImage: true });
    try {
      const mime = guessMime(base, ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : `image/${ext.slice(1)}`);
      const { structured, plainText } = await recognizeImageBuffer(buf, mime, name, vlConfig);
      const header = `\n\n======== VL IMAGE: ${name} ========\n`;
      sections.push(header + plainText);
      metas.push({ file: name, structured });
      text = replaceImagePlaceholder(text, base, plainText);
      emitVlProgress(progressMeta, 'done', { fileName: name, zipImage: true });
    } catch (e) {
      emitVlProgress(progressMeta, 'failed', {
        fileName: name,
        message: e.message,
        zipImage: true,
      });
      sections.push(
        `\n\n======== VL IMAGE FAILED: ${name} ========\n[识别失败] ${e.message}\n`
      );
    }
  }

  if (sections.length) {
    text = mergeRecognitionIntoText(text, sections.join('').trim());
  }

  return {
    text: text.trim(),
    vl: {
      status: imageCount > 0 ? 'done' : 'skipped',
      imageCount,
      meta: metas,
    },
  };
}

async function persistVlRecognition(submissionId, vlResult) {
  if (!submissionId) return;
  const status = vlResult?.status || 'skipped';
  const plainText = vlResult?.plainText || null;
  const meta = vlResult?.structured || vlResult?.meta || null;
  const errMsg = vlResult?.message || null;
  await pool.query(
    `UPDATE submissions SET
      vl_recognition_status = ?,
      vl_recognition_text = ?,
      vl_recognition_meta = ?,
      vl_recognition_error = ?,
      vl_recognition_at = CASE WHEN ? IN ('done','failed') THEN NOW() ELSE vl_recognition_at END
     WHERE id = ?`,
    [
      status,
      plainText,
      meta ? JSON.stringify(meta) : null,
      errMsg,
      status,
      submissionId,
    ]
  );
}

async function getVlRecognitionBySubmissionId(submissionId) {
  const [rows] = await pool.query(
    `SELECT vl_recognition_status, vl_recognition_text, vl_recognition_meta,
            vl_recognition_error, vl_recognition_at, file_name, file_type
     FROM submissions WHERE id = ? LIMIT 1`,
    [submissionId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  let meta = row.vl_recognition_meta;
  if (meta && typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = null;
    }
  }
  return {
    status: row.vl_recognition_status,
    text: row.vl_recognition_text,
    structured: meta,
    error: row.vl_recognition_error,
    recognizedAt: row.vl_recognition_at,
    fileName: row.file_name,
    fileType: row.file_type,
  };
}

/**
 * 对已存在提交重新执行视觉识别（不改变批改逻辑）
 */
async function rerunVlForSubmission(submissionId, progressMeta) {
  const [rows] = await pool.query(
    'SELECT id, file_path, file_name, file_type, content, archive_extracted_text, task_id, student_id FROM submissions WHERE id = ?',
    [submissionId]
  );
  if (!rows.length) {
    return { ok: false, message: '提交不存在' };
  }
  const row = rows[0];
  if (!row.file_path || !fs.existsSync(row.file_path)) {
    return { ok: false, message: '附件文件不存在，无法识别' };
  }

  const meta = {
    ...progressMeta,
    submissionId,
    taskId: row.task_id,
    studentId: row.student_id,
  };

  const isZip = /\.zip$/i.test(row.file_name || '') || row.file_type === 'application/zip';
  let vlPayload = { status: 'skipped' };
  let content = row.content;
  let archiveText = row.archive_extracted_text;

  if (isZip) {
    const zr = await appendZipImagesVlRecognition(row.file_path, archiveText || '', meta);
    archiveText = zr.text;
    vlPayload = zr.vl;
  } else {
    const er = await enhanceExtractedTextIfImage(
      row.file_path,
      row.file_type,
      row.file_name,
      '',
      meta
    );
    vlPayload = er.vl;
    if (er.vl?.plainText) {
      const marker = '---------- 附件解析文本 ----------';
      if (content && content.includes(marker)) {
        content = `${content.split(marker)[0].trim()}\n\n${marker}\n${er.text}`;
      } else {
        content = mergeRecognitionIntoText(content, er.vl.plainText);
      }
    }
  }

  await pool.query(
    'UPDATE submissions SET content = ?, archive_extracted_text = ? WHERE id = ?',
    [content, archiveText, submissionId]
  );

  const persist = {
    status: vlPayload.status || 'done',
    plainText: vlPayload.plainText || (Array.isArray(vlPayload.meta) ? archiveText : null),
    structured: vlPayload.structured || vlPayload.meta,
    message: vlPayload.message,
  };
  if (vlPayload.plainText) persist.plainText = vlPayload.plainText;
  else if (vlPayload.meta && Array.isArray(vlPayload.meta) && vlPayload.meta[0]?.structured) {
    persist.plainText = formatRecognitionForGrading(vlPayload.meta[0].structured);
  }

  await persistVlRecognition(submissionId, persist);
  return { ok: true, data: await getVlRecognitionBySubmissionId(submissionId) };
}

module.exports = {
  VL_MARKER,
  isImageSubmission,
  isImagePlaceholderText,
  mergeRecognitionIntoText,
  recognizeSubmissionImage,
  enhanceExtractedTextIfImage,
  appendZipImagesVlRecognition,
  persistVlRecognition,
  getVlRecognitionBySubmissionId,
  rerunVlForSubmission,
};
