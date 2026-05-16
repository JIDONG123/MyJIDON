const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

async function extractTextFromPdf(buffer) {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return (data.text || '').trim();
}

async function extractTextFromDocx(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return (value || '').trim();
}

function extractTextFromXlsxBuffer(buffer, originalName) {
  const XLSX = require('xlsx');
  try {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    let out = '';
    for (const sn of wb.SheetNames) {
      const sheet = wb.Sheets[sn];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet);
      out += `\n### Sheet: ${sn}\n${csv}\n`;
    }
    return out.trim();
  } catch (e) {
    return `[表格解析失败：${originalName}] ${e.message}`;
  }
}

function extractTextFromPptxBuffer(buffer, originalName) {
  try {
    const AdmZip = require('adm-zip');
    const z = new AdmZip(buffer);
    const entries = z
      .getEntries()
      .filter((e) => !e.isDirectory && /ppt\/slides\/slide\d+\.xml$/i.test(normalizeZipEntry(e.entryName)));
    entries.sort((a, b) => a.entryName.localeCompare(b.entryName));
    let t = '';
    const maxSlides = 80;
    for (let i = 0; i < Math.min(entries.length, maxSlides); i += 1) {
      try {
        const xml = entries[i].getData().toString('utf8');
        const plain = xml
          .replace(/<a:t[^>]*>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (plain) t += `${plain}\n`;
      } catch (_) {
        /* skip slide */
      }
    }
    return t.trim() || `[PPTX：${originalName}，未能提取正文]`;
  } catch (e) {
    return `[PPTX 解析失败：${originalName}] ${e.message}`;
  }
}

function normalizeZipEntry(name) {
  return String(name || '').replace(/\\/g, '/');
}

const CODE_LIKE_EXT = new Set([
  '.txt',
  '.md',
  '.csv',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.vue',
  '.json',
  '.java',
  '.py',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.less',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.go',
  '.php',
  '.rb',
  '.rs',
  '.sql',
  '.sh',
  '.bat',
  '.xml',
  '.yaml',
  '.yml',
  '.properties',
  '.gradle',
  '.cs',
  '.kt',
  '.swift',
]);

/**
 * 从内存 Buffer 提取文本（ZIP 内条目、单元测试复用）
 */
async function extractTextFromBuffer(buffer, mimeType, originalName) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return '';
  }
  const ext = path.extname(originalName || '').toLowerCase();
  const base = originalName || 'file';

  try {
    if (
      mimeType === 'text/plain' ||
      CODE_LIKE_EXT.has(ext) ||
      mimeType === 'text/markdown' ||
      mimeType === 'application/javascript' ||
      mimeType === 'application/json'
    ) {
      return buffer.toString('utf8').trim();
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === '.docx'
    ) {
      return await extractTextFromDocx(buffer);
    }

    if (mimeType === 'application/pdf' || ext === '.pdf') {
      return await extractTextFromPdf(buffer);
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel' ||
      ext === '.xlsx' ||
      ext === '.xls'
    ) {
      return extractTextFromXlsxBuffer(buffer, base);
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      ext === '.pptx'
    ) {
      return extractTextFromPptxBuffer(buffer, base);
    }

    if (mimeType === 'application/vnd.ms-powerpoint' || ext === '.ppt') {
      return `[旧版 PPT .ppt：${base}] 请另存为 .pptx 或导出 PDF 后放入压缩包以便解析文本。`;
    }

    if (mimeType?.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) {
      return `[图片文件：${base}]\n请结合学生在「提交说明」中填写的文字内容进行评价；如需 OCR，可在麒麟/龙架构环境部署 Tesseract 后扩展本服务。`;
    }

    if (mimeType === 'application/msword' || ext === '.doc') {
      return `[旧版 Word .doc：${base}] 请转换为 .docx 或 PDF 后放入压缩包以获得自动解析文本。`;
    }

    return `[二进制附件：${base}，类型 ${mimeType || ext}]`;
  } catch (e) {
    return `[文件解析失败：${base}] ${e.message}`;
  }
}

/**
 * 从上传文件中提取文本，供大模型批改与智能核查使用。
 * 支持：纯文本、Markdown、docx、pdf；图片类暂提取占位说明（可配合学生文字说明）。
 */
async function extractTextFromFile(filePath, mimeType, originalName) {
  if (!filePath || !fs.existsSync(filePath)) {
    return '';
  }
  const buffer = fs.readFileSync(filePath);
  return extractTextFromBuffer(buffer, mimeType, originalName || path.basename(filePath));
}

module.exports = { extractTextFromFile, extractTextFromBuffer };
