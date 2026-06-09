/**
 * 知识图谱 Neo4j 配置服务
 * 优先级：system_config 数据库 > process.env > 默认值
 */

const pool = require('../config/database');
const {
  DEFAULTS,
  parseBool,
  parseEnvConfig,
  clampSemanticMinSim,
  clampBatchSize,
  clampReconcileIntervalMs,
} = require('../utils/neo4jConfig');

const KG_CONFIG_KEYS = [
  'kg_neo4j_enabled',
  'neo4j_uri',
  'neo4j_user',
  'neo4j_password',
  'neo4j_database',
  'kg_reconcile_enabled',
  'kg_reconcile_interval_ms',
  'kg_semantic_min_sim',
  'kg_neo4j_batch',
  'kg_last_test_status',
  'kg_last_test_at',
  'kg_last_test_message',
  'kg_last_node_count',
  'kg_last_relation_count',
];

async function loadDbKgRows() {
  const [rows] = await pool.query(
    `SELECT config_key, config_value FROM system_config
     WHERE config_key LIKE 'kg_%' OR config_key LIKE 'neo4j_%'`
  );
  const map = {};
  for (const row of rows) {
    map[row.config_key] = row.config_value ?? '';
  }
  return map;
}

function pickString(dbVal, envVal, fallback) {
  const db = String(dbVal ?? '').trim();
  if (db) return db;
  const env = String(envVal ?? '').trim();
  if (env) return env;
  return fallback;
}

function pickPassword(dbVal, envVal) {
  const db = String(dbVal ?? '').trim();
  if (db) return db;
  return String(envVal ?? '').trim();
}

/**
 * 服务端完整配置（含密码，仅供内部使用）
 */
async function getKgConfig() {
  const db = await loadDbKgRows();
  const env = parseEnvConfig();

  const enabled = Object.prototype.hasOwnProperty.call(db, 'kg_neo4j_enabled')
    ? parseBool(db.kg_neo4j_enabled, DEFAULTS.enabled)
    : env.enabled;
  const uri = pickString(db.neo4j_uri, env.uri, DEFAULTS.uri);
  const user = pickString(db.neo4j_user, env.user, DEFAULTS.user);
  const password = pickPassword(db.neo4j_password, env.password);
  const database = pickString(db.neo4j_database, env.database, DEFAULTS.database);
  const reconcileEnabled = Object.prototype.hasOwnProperty.call(db, 'kg_reconcile_enabled')
    ? parseBool(db.kg_reconcile_enabled, DEFAULTS.reconcileEnabled)
    : env.reconcileEnabled;
  const reconcileIntervalMs = clampReconcileIntervalMs(
    db.kg_reconcile_interval_ms || env.reconcileIntervalMs
  );
  const semanticMinSim = clampSemanticMinSim(db.kg_semantic_min_sim || env.semanticMinSim);
  const batchSize = clampBatchSize(db.kg_neo4j_batch || env.batchSize);
  const poolSize = env.poolSize;

  return {
    enabled,
    uri,
    user,
    password,
    database,
    reconcileEnabled,
    reconcileIntervalMs,
    semanticMinSim,
    batchSize,
    poolSize,
    lastTestStatus: db.kg_last_test_status || '',
    lastTestAt: db.kg_last_test_at || null,
    lastTestMessage: db.kg_last_test_message || '',
    lastNodeCount:
      db.kg_last_node_count !== '' && db.kg_last_node_count != null
        ? Number(db.kg_last_node_count)
        : null,
    lastRelationCount:
      db.kg_last_relation_count !== '' && db.kg_last_relation_count != null
        ? Number(db.kg_last_relation_count)
        : null,
    passwordSource: String(db.neo4j_password || '').trim()
      ? 'database'
      : password
        ? 'env'
        : 'none',
  };
}

/**
 * 管理端展示用配置（不含密码明文）
 */
async function getKgPublicConfig() {
  const cfg = await getKgConfig();
  return {
    enabled: cfg.enabled,
    uri: cfg.uri,
    user: cfg.user,
    passwordConfigured: Boolean(cfg.password),
    database: cfg.database,
    reconcileEnabled: cfg.reconcileEnabled,
    reconcileIntervalMs: cfg.reconcileIntervalMs,
    semanticMinSim: cfg.semanticMinSim,
    batchSize: cfg.batchSize,
    lastTestStatus: cfg.lastTestStatus || '',
    lastTestAt: cfg.lastTestAt || null,
    lastTestMessage: cfg.lastTestMessage || '',
    nodeCount: cfg.lastNodeCount,
    relationCount: cfg.lastRelationCount,
  };
}

async function isKgNeo4jConfigured() {
  const cfg = await getKgConfig();
  return Boolean(cfg.enabled && cfg.password);
}

async function upsertKgConfig(key, value) {
  await pool.query(
    `INSERT INTO system_config (config_key, config_value, description, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = NOW()`,
    [key, String(value ?? ''), '']
  );
}

async function saveKgNeo4jSettings(body = {}) {
  const {
    enabled,
    uri,
    user,
    password,
    database,
    reconcileEnabled,
    reconcileIntervalMs,
    semanticMinSim,
    batchSize,
  } = body;

  if (!String(uri || '').trim()) {
    const err = new Error('Neo4j URI 不能为空');
    err.statusCode = 400;
    throw err;
  }
  if (!String(user || '').trim()) {
    const err = new Error('Neo4j 用户名不能为空');
    err.statusCode = 400;
    throw err;
  }
  if (!String(database || '').trim()) {
    const err = new Error('Neo4j 数据库名不能为空');
    err.statusCode = 400;
    throw err;
  }

  const interval = clampReconcileIntervalMs(reconcileIntervalMs);
  if (interval < 60000) {
    const err = new Error('对账间隔不能小于 60000 毫秒');
    err.statusCode = 400;
    throw err;
  }

  const sim = clampSemanticMinSim(semanticMinSim);
  if (sim < 0 || sim > 1) {
    const err = new Error('语义匹配最小相似度必须在 0 到 1 之间');
    err.statusCode = 400;
    throw err;
  }

  const batch = clampBatchSize(batchSize);
  if (batch < 1 || batch > 1000) {
    const err = new Error('Neo4j 批处理大小必须在 1 到 1000 之间');
    err.statusCode = 400;
    throw err;
  }

  const before = await getKgConfig();
  const passwordProvided =
    password !== undefined &&
    String(password).trim() !== '' &&
    !String(password).includes('****');

  await upsertKgConfig('kg_neo4j_enabled', enabled ? '1' : '0');
  await upsertKgConfig('neo4j_uri', String(uri).trim());
  await upsertKgConfig('neo4j_user', String(user).trim());
  await upsertKgConfig('neo4j_database', String(database).trim());
  await upsertKgConfig('kg_reconcile_enabled', reconcileEnabled ? '1' : '0');
  await upsertKgConfig('kg_reconcile_interval_ms', String(interval));
  await upsertKgConfig('kg_semantic_min_sim', String(sim));
  await upsertKgConfig('kg_neo4j_batch', String(batch));

  if (passwordProvided) {
    await upsertKgConfig('neo4j_password', String(password).trim());
  }

  const connectionChanged =
    before.uri !== String(uri).trim() ||
    before.user !== String(user).trim() ||
    before.database !== String(database).trim() ||
    passwordProvided;

  return { connectionChanged };
}

async function recordKgTestResult({ status, message, nodeCount, relationCount }) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const at = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  await upsertKgConfig('kg_last_test_status', status || '');
  await upsertKgConfig('kg_last_test_at', at);
  await upsertKgConfig('kg_last_test_message', message || '');
  if (nodeCount != null) await upsertKgConfig('kg_last_node_count', String(nodeCount));
  if (relationCount != null) await upsertKgConfig('kg_last_relation_count', String(relationCount));
}

module.exports = {
  KG_CONFIG_KEYS,
  getKgConfig,
  getKgPublicConfig,
  isKgNeo4jConfigured,
  saveKgNeo4jSettings,
  recordKgTestResult,
};
