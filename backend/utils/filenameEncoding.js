const path = require('path');

/**
 * Multer/busboy 将 multipart 里的文件名按 Latin-1 读入，浏览器实际发 UTF-8 → 入库乱码。
 * 写入前调用本函数可得到正确 UTF-8 文件名。
 */
function decodeMultipartFilename(name) {
  if (!name || typeof name !== "string") return name;
  try {
    return Buffer.from(name, "latin1").toString("utf8");
  } catch {
    return name;
  }
}

/**
 * 历史数据：UTF-8 字节被当成 Latin-1 字符写入库后，每个 code unit 均 ≤255。
 * 若已是正常中文（含 BMP 外或任意 charCode>255），原样返回。
 */
function normalizeStoredFileNameForDisplay(name) {
  if (!name || typeof name !== "string") return name;
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) > 255) return name;
  }
  try {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    if (decoded.includes("\uFFFD")) return name;
    return decoded;
  } catch {
    return name;
  }
}

function mapSubmissionFileName(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  if (out.file_name != null) {
    out.file_name = normalizeStoredFileNameForDisplay(out.file_name);
  }
  if (out.file_path) {
    const base = path.basename(String(out.file_path).trim());
    out.file_url = base ? `/uploads/${encodeURIComponent(base)}` : null;
    delete out.file_path;
  }
  return out;
}

module.exports = {
  decodeMultipartFilename,
  normalizeStoredFileNameForDisplay,
  mapSubmissionFileName,
};
