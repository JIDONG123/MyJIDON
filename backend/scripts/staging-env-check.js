#!/usr/bin/env node
/**
 * Staging / 龙芯部署前环境连通性检查（不删改数据）
 * 用法：cd backend && node scripts/staging-env-check.js
 */
require('../config/loadEnv').loadEnv();

const pool = require('../config/database');

async function checkRedis() {
  if (process.env.REDIS_ENABLED === '0' || process.env.REDIS_ENABLED === 'false') {
    return { ok: false, msg: 'REDIS_ENABLED=0' };
  }
  const Redis = require('ioredis');
  const url = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}/0`;
  const client = new Redis(url, { connectTimeout: 5000, maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return { ok: pong === 'PONG', msg: pong };
  } catch (e) {
    try {
      await client.quit();
    } catch {
      /* ignore */
    }
    return { ok: false, msg: e.message };
  }
}

async function checkNeo4j() {
  const { isKgNeo4jEnabled, getDriver, closeDriver } = require('../utils/kgNeo4jClient');
  if (!(await isKgNeo4jEnabled())) return { ok: false, msg: 'KG Neo4j 未启用或未配置密码' };
  try {
    const driver = await getDriver();
    if (!driver) return { ok: false, msg: '驱动未初始化' };
    await driver.verifyConnectivity();
    await closeDriver();
    return { ok: true, msg: process.env.NEO4J_URI || 'connected' };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

async function checkLlmConfig() {
  const [rows] = await pool.query(
    `SELECT config_key, config_value FROM system_config
     WHERE config_key IN ('llm_api_base','llm_model','llm_api_key','embedding_api_base','embedding_model','embedding_api_key')`
  );
  const map = Object.fromEntries(rows.map((r) => [r.config_key, r.config_value]));
  const llm = Boolean(map.llm_api_base && map.llm_model && map.llm_api_key);
  const emb = Boolean(map.embedding_api_base && map.embedding_model && map.embedding_api_key);
  const qwen = Boolean((process.env.QWEN_VL_API_KEY || process.env.DASHSCOPE_API_KEY || '').trim());
  return {
    llm,
    embedding: emb,
    qwenVl: qwen,
    llmModel: map.llm_model || '(未配置)',
    embeddingModel: map.embedding_model || '(未配置)',
  };
}

function line(name, ok, detail) {
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? `: ${detail}` : ''}`);
}

async function main() {
  console.log('=== Staging 环境检查 ===');
  console.log(`NODE_ENV=${process.env.NODE_ENV || '(unset)'} PORT=${process.env.PORT || '(unset)'}`);
  console.log(`REDIS_ENABLED=${process.env.REDIS_ENABLED || '(unset)'}`);
  console.log(`KG_NEO4J_ENABLED=${process.env.KG_NEO4J_ENABLED || '(unset)'} NEO4J_URI=${process.env.NEO4J_URI || '(unset)'}\n`);

  try {
    const [db] = await pool.query('SELECT 1 AS ok');
    line('MariaDB', db[0]?.ok === 1);
  } catch (e) {
    line('MariaDB', false, e.message);
  }

  const redis = await checkRedis();
  line('Redis', redis.ok, redis.msg);

  const neo = await checkNeo4j();
  line('Neo4j', neo.ok, neo.msg);

  const cfg = await checkLlmConfig();
  line('LLM (system_config)', cfg.llm, cfg.llmModel);
  line('Embedding (system_config)', cfg.embedding, cfg.embeddingModel);
  line('Qwen-VL (.env)', cfg.qwenVl, cfg.qwenVl ? '已配置 Key' : 'QWEN_VL_API_KEY 或 DASHSCOPE_API_KEY 未设');

  console.log('\nWorker 启动命令：');
  console.log('  cd backend && npm run worker:grading');
  console.log('龙芯生产：systemctl status smart-grading-grading-worker\n');

  const allOk = redis.ok && neo.ok && cfg.llm && cfg.embedding;
  if (!allOk) {
    console.log('部分检查未通过，请按 docs/04-deployment.md、docs/05-configuration.md 补齐后再做 E2E。');
    process.exit(1);
  }
  console.log('基础连通与模型配置就绪，可启动 Worker 并执行浏览器 E2E。');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    if (pool.end) await pool.end();
  });
