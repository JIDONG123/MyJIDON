const pool = require('../config/database');
const {
  getGradingTimeoutMs,
  getGradingRetry,
  getGradingBackoffMs,
} = require('./bullmqGradingConfig');

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function classifyLlmError(err, httpStatus) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return { type: 'timeout', userMessage: 'AI 服务响应超时，请稍后重试。' };
  }
  const msg = String(err?.message || err || '');
  if (httpStatus === 429 || /429|rate limit|限流/i.test(msg)) {
    return { type: 'rate_limit', userMessage: 'AI 服务限流，请稍后重试。' };
  }
  if (httpStatus >= 500 || /5\d{2}/.test(msg)) {
    return { type: 'server_error', userMessage: 'AI 服务暂不可用，请检查模型配置。' };
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network|socket/i.test(msg)) {
    return { type: 'network', userMessage: 'AI 服务连接失败，请检查网络与 API 地址。' };
  }
  return { type: 'unknown', userMessage: 'AI 批改失败，请稍后重试。' };
}

class LlmCallError extends Error {
  constructor(message, { type, userMessage, httpStatus, cause } = {}) {
    super(message);
    this.name = 'LlmCallError';
    this.errorType = type || 'unknown';
    this.userMessage = userMessage || message;
    this.httpStatus = httpStatus;
    if (cause) this.cause = cause;
  }
}

async function chatCompletionOnce(messages, options = {}) {
  const cfg = await getSystemConfigs(['llm_api_base', 'llm_api_key', 'llm_model']);
  const apiBase = (cfg.llm_api_base || '').trim();
  const apiKey = (cfg.llm_api_key || '').trim();
  const model = (cfg.llm_model || 'gpt-3.5-turbo').trim();

  if (!apiBase || !apiKey) {
    return null;
  }

  const url = buildChatUrl(apiBase);
  if (!url) return null;

  const timeoutMs =
    options.timeoutMs != null && Number(options.timeoutMs) > 0
      ? Number(options.timeoutMs)
      : getGradingTimeoutMs();

  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.max_tokens ?? 4096,
  };

  const fetchOpts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  };

  let res;
  try {
    res = await fetch(url, fetchOpts);
  } catch (e) {
    const c = classifyLlmError(e);
    throw new LlmCallError(e.message || c.userMessage, {
      type: c.type,
      userMessage: c.userMessage,
      cause: e,
    });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const c = classifyLlmError(new Error(errText), res.status);
    throw new LlmCallError(`LLM HTTP ${res.status}: ${errText.slice(0, 300)}`, {
      type: c.type,
      userMessage: c.userMessage,
      httpStatus: res.status,
    });
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  const usage = data?.usage;
  return {
    text: typeof text === 'string' ? text : null,
    usage,
  };
}

/**
 * OpenAI 兼容 Chat Completions（timeout + 有限 retry + backoff）
 * @returns {Promise<string|null>}
 */
async function chatCompletion(messages, options = {}) {
  const maxRetry = options.maxRetry != null ? Number(options.maxRetry) : getGradingRetry();
  const backoffMs = options.backoffMs != null ? Number(options.backoffMs) : getGradingBackoffMs();
  let lastErr;

  for (let attempt = 0; attempt <= maxRetry; attempt += 1) {
    try {
      const result = await chatCompletionOnce(messages, options);
      if (!result) return null;
      if (options.returnMeta) {
        return result;
      }
      return result.text;
    } catch (e) {
      lastErr = e;
      const retriable =
        e instanceof LlmCallError &&
        ['timeout', 'rate_limit', 'server_error', 'network'].includes(e.errorType);
      if (!retriable || attempt >= maxRetry) {
        throw e;
      }
      const delay = backoffMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw lastErr;
}

function maskKey(key) {
  if (!key || key.length < 8) return key ? '********' : '';
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

async function getLlmRequestConfig(options = {}) {
  const cfg = await getSystemConfigs(['llm_api_base', 'llm_api_key', 'llm_model']);
  const apiBase = (cfg.llm_api_base || '').trim();
  const apiKey = (cfg.llm_api_key || '').trim();
  const model = (cfg.llm_model || 'gpt-3.5-turbo').trim();
  const url = buildChatUrl(apiBase);
  if (!apiBase || !apiKey || !url) return null;

  const timeoutMs =
    options.timeoutMs != null && Number(options.timeoutMs) > 0
      ? Number(options.timeoutMs)
      : getGradingTimeoutMs();

  return { url, apiKey, model, timeoutMs };
}

function parseOpenAiStreamLine(line, onDelta) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed === 'data: [DONE]') return '';
  if (!trimmed.startsWith('data: ')) return '';
  try {
    const json = JSON.parse(trimmed.slice(6));
    const delta = json?.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta) {
      if (onDelta) onDelta(delta);
      return delta;
    }
  } catch {
    /* ignore malformed chunk */
  }
  return '';
}

/**
 * OpenAI 兼容流式 Chat Completions（仅 AI 助手 / RAG 问答使用，不影响阻塞 chatCompletion）
 * @returns {Promise<{ text: string, usage: object|null, streamed: boolean }|null>}
 */
async function chatCompletionStream(messages, options = {}, callbacks = {}) {
  const reqCfg = await getLlmRequestConfig(options);
  if (!reqCfg) return null;

  const { url, apiKey, model, timeoutMs } = reqCfg;
  const { onDelta, signal, isAborted } = callbacks;

  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.max_tokens ?? 4096,
    stream: true,
  };

  const abortSignal =
    signal ||
    (typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: abortSignal,
    });
  } catch (e) {
    const c = classifyLlmError(e);
    throw new LlmCallError(e.message || c.userMessage, {
      type: c.type,
      userMessage: c.userMessage,
      cause: e,
    });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const c = classifyLlmError(new Error(errText), res.status);
    throw new LlmCallError(`LLM HTTP ${res.status}: ${errText.slice(0, 300)}`, {
      type: c.type,
      userMessage: c.userMessage,
      httpStatus: res.status,
    });
  }

  if (!res.body || typeof res.body.getReader !== 'function') {
    throw new LlmCallError('LLM stream body unavailable', {
      type: 'unknown',
      userMessage: 'AI 服务暂不可用，请稍后重试。',
    });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      if (isAborted?.()) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const piece = parseOpenAiStreamLine(line, onDelta);
        if (piece) fullText += piece;
      }
    }
    if (buffer.trim()) {
      const piece = parseOpenAiStreamLine(buffer, onDelta);
      if (piece) fullText += piece;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  return {
    text: fullText,
    usage: null,
    streamed: true,
  };
}

module.exports = {
  getSystemConfigs,
  chatCompletion,
  chatCompletionOnce,
  chatCompletionStream,
  classifyLlmError,
  LlmCallError,
  maskKey,
  parseOpenAiStreamLine,
};
