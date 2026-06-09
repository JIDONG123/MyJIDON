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
async function retrieveTeacherKbHits(teacherIdOrIds, queryText, topK = 6) {
  const empty = { contextText: '', hits: [] };
  const ids = (Array.isArray(teacherIdOrIds) ? teacherIdOrIds : [teacherIdOrIds])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length || !queryText || !String(queryText).trim()) {
    return empty;
  }

  const ph = ids.map(() => '?').join(',');
  const [chunks] = await pool.query(
    `SELECT c.id, c.document_id, c.teacher_id, c.chunk_index, c.content, c.embedding,
            d.title, d.category
     FROM kb_chunks c
     LEFT JOIN kb_documents d ON d.id = c.document_id
     WHERE c.teacher_id IN (${ph}) AND c.embedding IS NOT NULL`,
    ids
  );
  if (!chunks.length) return empty;

  let queryVec;
  try {
    const vecs = await embedTexts([String(queryText).slice(0, 8000)]);
    queryVec = vecs[0];
  } catch {
    return empty;
  }

  const scored = [];
  for (const row of chunks) {
    const emb = parseEmbedding(row.embedding);
    if (!emb || emb.length !== queryVec.length) continue;
    const score = cosineSimilarity(queryVec, emb);
    scored.push({
      documentId: row.document_id,
      title: row.title || '未命名文档',
      category: row.category || 'other',
      chunkIndex: row.chunk_index,
      content: String(row.content || ''),
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, topK);
  if (!picked.length || picked[0].score < 0.08) return empty;

  const hits = picked.map((x) => ({
    documentId: x.documentId,
    title: x.title,
    category: x.category,
    chunkIndex: x.chunkIndex,
    snippet: x.content.slice(0, 480),
    score: Math.round(x.score * 1000) / 1000,
  }));

  const contextText = picked
    .map(
      (x, i) =>
        `【知识库片段 ${i + 1}】文档：${x.title}（${x.category}，相关度约 ${x.score.toFixed(3)}）\n${x.content.slice(0, 1400)}`
    )
    .join('\n\n');

  return { contextText, hits };
}

async function retrieveTeacherKbContext(teacherId, queryText, topK = 6) {
  const { contextText } = await retrieveTeacherKbHits(teacherId, queryText, topK);
  return contextText;
}

module.exports = {
  buildRagQueryText,
  retrieveTeacherKbContext,
  retrieveTeacherKbHits,
  cosineSimilarity,
};
