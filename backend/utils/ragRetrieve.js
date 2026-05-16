const pool = require('../config/database');
const { embedTexts } = require('./embeddingClient');

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 1e-12 ? dot / denom : 0;
}

function parseEmbedding(val) {
  if (val == null) return null;
  if (Array.isArray(val)) return val.map((x) => Number(x));
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(val)) {
    try {
      const arr = JSON.parse(val.toString('utf8'));
      return Array.isArray(arr) ? arr.map((x) => Number(x)) : null;
    } catch {
      return null;
    }
  }
  if (typeof val === 'string') {
    try {
      const arr = JSON.parse(val);
      return Array.isArray(arr) ? arr.map((x) => Number(x)) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function buildRagQueryText(task, submissionText) {
  const title = task?.title || '';
  const req = task?.requirements || '';
  const crit = task?.scoring_criteria || '';
  const sub = (submissionText || '').slice(0, 4000);
  return `【任务】${title}\n【要求】${req}\n【评分说明】${crit}\n【学生提交摘录】\n${sub}`;
}

/**
 * 从指定教师的知识库中检索与 queryText 最相关的片段，拼成供大模型阅读的上下文。
 * 无配置、无向量、无块时返回空字符串（走原有批改）。
 */
async function retrieveTeacherKbContext(teacherId, queryText, topK = 6) {
  const tid = Number(teacherId);
  if (!tid || Number.isNaN(tid) || !queryText || !String(queryText).trim()) {
    return '';
  }

  const [chunks] = await pool.query(
    `SELECT id, content, embedding FROM kb_chunks WHERE teacher_id = ? AND embedding IS NOT NULL`,
    [tid]
  );
  if (!chunks.length) return '';

  let queryVec;
  try {
    const vecs = await embedTexts([String(queryText).slice(0, 8000)]);
    queryVec = vecs[0];
  } catch {
    return '';
  }

  const scored = [];
  for (const row of chunks) {
    const emb = parseEmbedding(row.embedding);
    if (!emb || emb.length !== queryVec.length) continue;
    const score = cosineSimilarity(queryVec, emb);
    scored.push({ content: String(row.content || ''), score });
  }

  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, topK);
  if (!picked.length) return '';

  return picked
    .map((x, i) => `【知识库片段 ${i + 1}】（语义相关度约 ${x.score.toFixed(3)}）\n${x.content.slice(0, 1400)}`)
    .join('\n\n');
}

module.exports = {
  buildRagQueryText,
  retrieveTeacherKbContext,
  cosineSimilarity,
};
