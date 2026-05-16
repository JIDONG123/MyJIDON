/**
 * 将长文本分块，便于向量嵌入与 RAG 检索。
 * @param {string} text
 * @param {{ maxChars?: number, overlap?: number }} opts
 */
function chunkText(text, opts = {}) {
  const max = opts.maxChars || 900;
  const overlap = opts.overlap || 80;
  const t = String(text || '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!t) return [];

  const paras = t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = '';

  const flush = () => {
    if (buf.length) chunks.push(buf);
    buf = '';
  };

  for (const p of paras) {
    if (p.length > max) {
      flush();
      for (let i = 0; i < p.length; i += max - overlap) {
        const piece = p.slice(i, i + max);
        if (piece.trim().length > 8) chunks.push(piece);
      }
      continue;
    }
    if (buf.length + p.length + 1 <= max) {
      buf = buf ? `${buf}\n${p}` : p;
    } else {
      flush();
      buf = p;
    }
  }
  flush();
  return chunks.filter((c) => c.length > 10);
}

module.exports = { chunkText };
