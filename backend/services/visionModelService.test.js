const test = require('node:test');
const assert = require('node:assert/strict');

process.env.QWEN_VL_API_KEY = 'env-test-key';
process.env.QWEN_VL_API_BASE = 'https://env.example.com/v1';
process.env.QWEN_VL_MODEL = 'env-model';

const pool = require('../config/database');

const originalQuery = pool.query.bind(pool);
const mockRows = {};

pool.query = async (sql, params) => {
  if (typeof sql === 'string' && sql.includes('FROM system_config') && sql.includes('qwen_vl_%')) {
    const rows = Object.entries(mockRows).map(([config_key, config_value]) => ({
      config_key,
      config_value,
    }));
    return [rows];
  }
  return originalQuery(sql, params);
};

const {
  getQwenVlConfig,
  DEFAULT_API_BASE,
  DEFAULT_MODEL,
  DEFAULT_TEST_PROMPT,
} = require('../services/visionModelService');

test('getQwenVlConfig falls back to env when database values are empty', async () => {
  Object.keys(mockRows).forEach((k) => delete mockRows[k]);
  mockRows.qwen_vl_enabled = '1';
  mockRows.qwen_vl_api_base = '';
  mockRows.qwen_vl_api_key = '';
  mockRows.qwen_vl_model = '';

  const cfg = await getQwenVlConfig();
  assert.equal(cfg.apiBase, 'https://env.example.com/v1');
  assert.equal(cfg.apiKey, 'env-test-key');
  assert.equal(cfg.model, 'env-model');
  assert.equal(cfg.enabled, true);
});

test('getQwenVlConfig prefers non-empty database values over env', async () => {
  mockRows.qwen_vl_enabled = '0';
  mockRows.qwen_vl_api_base = 'https://db.example.com/v1';
  mockRows.qwen_vl_api_key = 'db-secret-key';
  mockRows.qwen_vl_model = 'db-vl-model';

  const cfg = await getQwenVlConfig();
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.apiBase, 'https://db.example.com/v1');
  assert.equal(cfg.apiKey, 'db-secret-key');
  assert.equal(cfg.model, 'db-vl-model');
  assert.equal(cfg.apiKeySource, 'database');
});

test('defaults are defined for base and model', () => {
  assert.equal(DEFAULT_API_BASE, 'https://dashscope.aliyuncs.com/compatible-mode/v1');
  assert.equal(DEFAULT_MODEL, 'qwen3-vl-plus');
  assert.match(DEFAULT_TEST_PROMPT, /代码/);
});

test.after(() => {
  pool.query = originalQuery;
});
