/**
 * Qwen-VL 视觉识别配置与测试服务
 * 配置优先级：system_config 数据库 > process.env > 默认值
 */

const pool = require('../config/database');
const { maskKey } = require('../utils/llmClient');
const {
  recognizeImageBuffer,
  recognizeImageWithPrompt,
  guessMime,
} = require('../utils/qwenVlClient');

const DEFAULT_API_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen3-vl-plus';
const DEFAULT_TEST_PROMPT =
  '请简要描述这张图片中的主要内容，并判断是否包含代码、运行结果或项目界面。';

const QWEN_VL_CONFIG_KEYS = [
  'qwen_vl_enabled',
  'qwen_vl_api_base',
  'qwen_vl_api_key',
  'qwen_vl_model',
  'qwen_vl_last_test_status',
  'qwen_vl_last_test_at',
  'qwen_vl_last_test_message',
];

function parseEnabled(value) {
  if (value === '' || value == null) return true;
  const v = String(value).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function normalizeApiBase(apiBase) {
  return String(apiBase || DEFAULT_API_BASE)
    .trim()
    .replace(/\/$/, '') || DEFAULT_API_BASE;
}

async function loadDbQwenVlRows() {
  const [rows] = await pool.query(
    `SELECT config_key, config_value FROM system_config WHERE config_key LIKE 'qwen_vl_%'`
  );
  const map = {};
  for (const row of rows) {
    map[row.config_key] = row.config_value ?? '';
  }
  return map;
}

/**
 * 读取完整 Qwen-VL 配置（含 API Key，仅供后端内部使用）
 * @returns {Promise<object>}
 */
async function getQwenVlConfig() {
  const db = await loadDbQwenVlRows();

  const enabled = Object.prototype.hasOwnProperty.call(db, 'qwen_vl_enabled')
    ? parseEnabled(db.qwen_vl_enabled)
    : true;
  const apiBase = normalizeApiBase(
    String(db.qwen_vl_api_base || '').trim() ||
      process.env.QWEN_VL_API_BASE ||
      DEFAULT_API_BASE
  );
  const apiKey = (
    String(db.qwen_vl_api_key || '').trim() ||
    process.env.QWEN_VL_API_KEY ||
    ''
  ).trim();
  const model = (
    String(db.qwen_vl_model || '').trim() ||
    process.env.QWEN_VL_MODEL ||
    DEFAULT_MODEL
  ).trim();
  const timeoutMs = parseInt(process.env.QWEN_VL_TIMEOUT_MS || '120000', 10);
  const maxImageBytes = parseInt(
    process.env.QWEN_VL_MAX_IMAGE_BYTES || String(5 * 1024 * 1024),
    10
  );

  return {
    enabled,
    apiBase,
    apiKey,
    model,
    timeoutMs,
    maxImageBytes,
    lastTestStatus: db.qwen_vl_last_test_status || '',
    lastTestAt: db.qwen_vl_last_test_at || null,
    lastTestMessage: db.qwen_vl_last_test_message || '',
    apiKeySource: String(db.qwen_vl_api_key || '').trim()
      ? 'database'
      : apiKey
        ? 'env'
        : 'none',
  };
}

/**
 * 管理端展示用配置（不含 API Key 明文）
 */
async function getQwenVlConfigForAdmin() {
  const cfg = await getQwenVlConfig();
  return {
    enabled: cfg.enabled,
    apiBase: cfg.apiBase,
    apiKeyConfigured: Boolean(cfg.apiKey),
    model: cfg.model,
    lastTestStatus: cfg.lastTestStatus || '',
    lastTestAt: cfg.lastTestAt || null,
    lastTestMessage: cfg.lastTestMessage || '',
  };
}

async function isQwenVlConfigured() {
  const cfg = await getQwenVlConfig();
  return Boolean(cfg.enabled && cfg.apiKey);
}

async function upsertQwenVlConfig(key, value) {
  await pool.query(
    `INSERT INTO system_config (config_key, config_value, description, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = NOW()`,
    [key, String(value ?? ''), '']
  );
}

async function saveQwenVlSettings(body = {}) {
  const { enabled, apiBase, apiKey, model } = body;

  if (!String(apiBase || '').trim()) {
    const err = new Error('API Base URL 不能为空');
    err.statusCode = 400;
    throw err;
  }
  if (!String(model || '').trim()) {
    const err = new Error('模型名称不能为空');
    err.statusCode = 400;
    throw err;
  }

  await upsertQwenVlConfig('qwen_vl_enabled', enabled ? '1' : '0');
  await upsertQwenVlConfig('qwen_vl_api_base', String(apiBase).trim());
  await upsertQwenVlConfig('qwen_vl_model', String(model).trim());

  if (
    apiKey !== undefined &&
    String(apiKey).trim() !== '' &&
    !String(apiKey).includes('****')
  ) {
    await upsertQwenVlConfig('qwen_vl_api_key', String(apiKey).trim());
  }
}

async function recordQwenVlTestResult({ status, message }) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const at = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  await upsertQwenVlConfig('qwen_vl_last_test_status', status || '');
  await upsertQwenVlConfig('qwen_vl_last_test_at', at);
  await upsertQwenVlConfig('qwen_vl_last_test_message', message || '');
}

/**
 * 管理端测试 Qwen-VL 图像识别
 */
async function testQwenVlConnection({ imageBuffer, mimeType, fileName, prompt }) {
  const cfg = await getQwenVlConfig();
  if (!cfg.apiKey) {
    const err = new Error('Qwen-VL API Key 未配置');
    err.statusCode = 400;
    throw err;
  }
  if (!cfg.enabled) {
    const err = new Error('Qwen-VL 图像识别未启用');
    err.statusCode = 400;
    throw err;
  }
  if (!Buffer.isBuffer(imageBuffer) || !imageBuffer.length) {
    const err = new Error('请上传测试图片');
    err.statusCode = 400;
    throw err;
  }

  const started = Date.now();
  const testPrompt = String(prompt || '').trim() || DEFAULT_TEST_PROMPT;
  const mime = guessMime(fileName, mimeType);

  try {
    const { result, raw } = await recognizeImageWithPrompt({
      buffer: imageBuffer,
      mimeType: mime,
      fileName: fileName || 'test-image',
      prompt: testPrompt,
      config: cfg,
    });
    const elapsedMs = Date.now() - started;
    await recordQwenVlTestResult({
      status: 'success',
      message: '连接正常',
    });
    return {
      status: 'success',
      model: cfg.model,
      elapsedMs,
      result: result || raw || '',
    };
  } catch (e) {
    const elapsedMs = Date.now() - started;
    const message = e?.message || 'Qwen-VL 图像识别测试失败';
    await recordQwenVlTestResult({
      status: 'failed',
      message,
    });
    const err = new Error(`Qwen-VL 图像识别测试失败：${message}`);
    err.statusCode = 502;
    err.elapsedMs = elapsedMs;
    err.model = cfg.model;
    throw err;
  }
}

/**
 * 预留给 AI 批改等业务的图像分析入口
 */
async function analyzeImageForGrading(image, prompt) {
  const cfg = await getQwenVlConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return { ok: false, status: 'skipped', message: 'Qwen-VL 未启用或未配置' };
  }

  let buffer;
  let mimeType;
  let fileName;

  if (Buffer.isBuffer(image)) {
    buffer = image;
    mimeType = 'image/png';
    fileName = 'grading-image.png';
  } else if (image && Buffer.isBuffer(image.buffer)) {
    buffer = image.buffer;
    mimeType = image.mimeType;
    fileName = image.fileName;
  } else {
    return { ok: false, status: 'failed', message: '无效的图片数据' };
  }

  try {
    const { structured, plainText, raw } = await recognizeImageBuffer(
      buffer,
      mimeType,
      fileName,
      cfg
    );
    return {
      ok: true,
      status: 'done',
      structured,
      plainText,
      raw,
      model: cfg.model,
    };
  } catch (e) {
    return {
      ok: false,
      status: 'failed',
      message: e?.message || '图像识别失败',
      model: cfg.model,
    };
  }
}

function maskQwenVlKeyForDisplay(key) {
  return maskKey(key);
}

module.exports = {
  DEFAULT_API_BASE,
  DEFAULT_MODEL,
  DEFAULT_TEST_PROMPT,
  QWEN_VL_CONFIG_KEYS,
  getQwenVlConfig,
  getQwenVlConfigForAdmin,
  isQwenVlConfigured,
  saveQwenVlSettings,
  testQwenVlConnection,
  analyzeImageForGrading,
  recordQwenVlTestResult,
  maskQwenVlKeyForDisplay,
};
