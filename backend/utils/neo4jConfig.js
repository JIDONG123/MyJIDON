/**
 * Neo4j / 知识图谱环境变量默认值与解析工具
 */

const DEFAULTS = {
  enabled: false,
  uri: 'bolt://127.0.0.1:7687',
  user: 'neo4j',
  password: '',
  database: 'neo4j',
  reconcileEnabled: false,
  reconcileIntervalMs: 21600000,
  semanticMinSim: 0.72,
  batchSize: 150,
  poolSize: 20,
};

function parseBool(value, fallback = false) {
  if (value === '' || value == null) return fallback;
  const v = String(value).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function parseEnvConfig() {
  return {
    enabled: parseBool(process.env.KG_NEO4J_ENABLED, DEFAULTS.enabled),
    uri: String(process.env.NEO4J_URI || DEFAULTS.uri).trim(),
    user: String(process.env.NEO4J_USER || DEFAULTS.user).trim(),
    password: String(process.env.NEO4J_PASSWORD || '').trim(),
    database: String(process.env.NEO4J_DATABASE || DEFAULTS.database).trim(),
    reconcileEnabled: parseBool(process.env.KG_RECONCILE_ENABLED, DEFAULTS.reconcileEnabled),
    reconcileIntervalMs: parseInt(
      process.env.KG_RECONCILE_INTERVAL_MS || String(DEFAULTS.reconcileIntervalMs),
      10
    ),
    semanticMinSim: parseFloat(process.env.KG_SEMANTIC_MIN_SIM || String(DEFAULTS.semanticMinSim)),
    batchSize: parseInt(process.env.KG_NEO4J_BATCH || String(DEFAULTS.batchSize), 10),
    poolSize: parseInt(process.env.NEO4J_POOL_SIZE || String(DEFAULTS.poolSize), 10),
  };
}

function clampSemanticMinSim(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return DEFAULTS.semanticMinSim;
  return Math.min(1, Math.max(0, n));
}

function clampBatchSize(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return DEFAULTS.batchSize;
  return Math.min(1000, Math.max(1, n));
}

function clampReconcileIntervalMs(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return DEFAULTS.reconcileIntervalMs;
  return Math.max(60000, n);
}

module.exports = {
  DEFAULTS,
  parseBool,
  parseEnvConfig,
  clampSemanticMinSim,
  clampBatchSize,
  clampReconcileIntervalMs,
};
