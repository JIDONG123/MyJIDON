const pool = require('../config/database');

async function getSystemConfigs(keys) {
  const placeholders = keys.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT config_key, config_value FROM system_config WHERE config_key IN (${placeholders})`,
    keys
  );
  const map = {};
  for (const row of rows) {
    map[row.config_key] = row.config_value;
  }
  return map;
}

function buildChatUrl(apiBase) {
  if (!apiBase) return null;
  const trimmed = apiBase.replace(/\/$/, '');
  if (/\/v1(\/|$)/.test(trimmed)) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

/**
 * OpenAI 兼容 Chat Completions 调用
 * @returns {Promise<string|null>} assistant 文本或 null（未配置/失败）
 */
async function chatCompletion(messages, options = {}) {
  const cfg = await getSystemConfigs([
    'llm_api_base',
    'llm_api_key',
    'llm_model',
  ]);
  const apiBase = (cfg.llm_api_base || '').trim();
  const apiKey = (cfg.llm_api_key || '').trim();
  const model = (cfg.llm_model || 'gpt-3.5-turbo').trim();

  if (!apiBase || !apiKey) {
    return null;
  }

  const url = buildChatUrl(apiBase);
  if (!url) return null;

  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.max_tokens ?? 4096,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LLM HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === 'string' ? text : null;
}

function maskKey(key) {
  if (!key || key.length < 8) return key ? '********' : '';
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

module.exports = {
  getSystemConfigs,
  chatCompletion,
  maskKey,
};
