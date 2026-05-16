const pool = require('../config/database');

const DASHSCOPE_COMPAT_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

async function getEmbeddingConfig() {
  const [rows] = await pool.query(
    `SELECT config_key, config_value FROM system_config WHERE config_key IN ('embedding_api_base','embedding_api_key','embedding_model')`
  );
  const map = {};
  for (const row of rows) {
    map[row.config_key] = row.config_value;
  }
  const apiKey =
    (map.embedding_api_key || '').trim() ||
    (process.env.DASHSCOPE_API_KEY || '').trim() ||
    (process.env.EMBEDDING_API_KEY || '').trim();
  let apiBase = (map.embedding_api_base || '').trim();
  if (!apiBase) apiBase = (process.env.EMBEDDING_API_BASE || '').trim() || DASHSCOPE_COMPAT_BASE;
  apiBase = apiBase.replace(/\/$/, '');
  const model = (map.embedding_model || '').trim() || 'text-embedding-v4';
  return { apiKey, apiBase, model };
}

/**
 * 调用 OpenAI 兼容 Embeddings 接口（DashScope / Qwen text-embedding-v4）。
 * @param {string[]} texts 单次建议 ≤10 条（DashScope 限制）
 * @returns {Promise<number[][]>}
 */
async function embedTexts(texts) {
  const list = (texts || []).map((t) => String(t || '').slice(0, 8000)).filter((t) => t.length > 0);
  if (!list.length) return [];

  const { apiKey, apiBase, model } = await getEmbeddingConfig();
  if (!apiKey) {
    throw new Error('未配置向量 API Key（管理端「系统设置」embedding_api_key 或环境变量 DASHSCOPE_API_KEY）');
  }

  const url = `${apiBase}/embeddings`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: list,
      encoding_format: 'float',
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    let detail = rawText.slice(0, 500);
    try {
      const j = JSON.parse(rawText);
      if (j.error && typeof j.error === 'object' && j.error.message) {
        detail = String(j.error.message);
      } else if (typeof j.message === 'string') {
        detail = j.message;
      }
    } catch (_) {}
    let hint = '';
    if (res.status === 401 || res.status === 403) {
      hint =
        '（常见原因：密钥与区域不匹配——国际区/新加坡控制台申请的 Key 须使用 Base：https://dashscope-intl.aliyuncs.com/compatible-mode/v1 ；中国大陆控制台申请的 Key 使用：https://dashscope.aliyuncs.com/compatible-mode/v1 ）';
    }
    throw new Error(`Embedding HTTP ${res.status}: ${detail}${hint}`);
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error('Embedding 响应非 JSON');
  }

  const items = data?.data;
  if (!Array.isArray(items)) {
    throw new Error('Embedding 响应缺少 data 数组');
  }

  items.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const out = items.map((row) => {
    const emb = row.embedding;
    if (!Array.isArray(emb)) {
      throw new Error('单条 embedding 格式错误');
    }
    return emb.map((x) => Number(x));
  });

  if (out.length !== list.length) {
    throw new Error(`Embedding 条数不匹配：期望 ${list.length}，实际 ${out.length}`);
  }
  return out;
}

/** 自动按 10 条一批调用 embedTexts */
async function embedTextsBatched(texts, batchSize = 10) {
  const all = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const part = await embedTexts(batch);
    all.push(...part);
  }
  return all;
}

module.exports = {
  getEmbeddingConfig,
  embedTexts,
  embedTextsBatched,
};
