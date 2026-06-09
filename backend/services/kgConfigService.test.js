const test = require('node:test');
const assert = require('node:assert/strict');

process.env.KG_NEO4J_ENABLED = '0';
process.env.NEO4J_URI = 'bolt://env.example:7687';
process.env.NEO4J_USER = 'envuser';
process.env.NEO4J_PASSWORD = 'env-pass';
process.env.NEO4J_DATABASE = 'envdb';
process.env.KG_RECONCILE_ENABLED = '1';
process.env.KG_RECONCILE_INTERVAL_MS = '3600000';
process.env.KG_SEMANTIC_MIN_SIM = '0.8';
process.env.KG_NEO4J_BATCH = '200';

const pool = require('../config/database');
const originalQuery = pool.query.bind(pool);
const mockRows = {};

pool.query = async (sql, params) => {
  if (
    typeof sql === 'string' &&
    sql.includes('system_config') &&
    (sql.includes('kg_%') || sql.includes('neo4j_%'))
  ) {
    const rows = Object.entries(mockRows).map(([config_key, config_value]) => ({
      config_key,
      config_value,
    }));
    return [rows];
  }
  if (typeof sql === 'string' && sql.includes('INSERT INTO system_config')) {
    const key = params?.[0];
    const val = params?.[1];
    if (key) mockRows[key] = val;
    return [{ affectedRows: 1 }];
  }
  return originalQuery(sql, params);
};

const { getKgConfig, getKgPublicConfig } = require('../services/kgConfigService');
const { mapNeo4jError } = require('../services/neo4jHealthService');
const { DEFAULTS } = require('../utils/neo4jConfig');

test('getKgConfig falls back to env when database values are empty', async () => {
  Object.keys(mockRows).forEach((k) => delete mockRows[k]);
  mockRows.kg_neo4j_enabled = '0';
  mockRows.neo4j_uri = '';
  mockRows.neo4j_user = '';
  mockRows.neo4j_password = '';
  mockRows.neo4j_database = '';

  const cfg = await getKgConfig();
  assert.equal(cfg.uri, 'bolt://env.example:7687');
  assert.equal(cfg.user, 'envuser');
  assert.equal(cfg.password, 'env-pass');
  assert.equal(cfg.database, 'envdb');
  assert.equal(cfg.reconcileIntervalMs, 3600000);
  assert.equal(cfg.semanticMinSim, 0.8);
  assert.equal(cfg.batchSize, 200);
});

test('getKgConfig prefers non-empty database values over env', async () => {
  mockRows.kg_neo4j_enabled = '1';
  mockRows.neo4j_uri = 'bolt://db.example:7687';
  mockRows.neo4j_user = 'dbuser';
  mockRows.neo4j_password = 'db-pass';
  mockRows.neo4j_database = 'graphdb';
  mockRows.kg_reconcile_enabled = '0';
  mockRows.kg_reconcile_interval_ms = '7200000';
  mockRows.kg_semantic_min_sim = '0.65';
  mockRows.kg_neo4j_batch = '100';

  const cfg = await getKgConfig();
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.uri, 'bolt://db.example:7687');
  assert.equal(cfg.password, 'db-pass');
  assert.equal(cfg.database, 'graphdb');
  assert.equal(cfg.reconcileEnabled, false);
  assert.equal(cfg.batchSize, 100);
});

test('getKgPublicConfig never exposes password', async () => {
  const pub = await getKgPublicConfig();
  assert.equal(pub.passwordConfigured, true);
  assert.equal(Object.prototype.hasOwnProperty.call(pub, 'password'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pub, 'neo4j_password'), false);
});

test('mapNeo4jError returns friendly messages', () => {
  assert.match(mapNeo4jError(new Error('Connection refused')), /不可达/);
  assert.match(mapNeo4jError(new Error('Authentication failed')), /密码错误/);
});

test('defaults are defined', () => {
  assert.equal(DEFAULTS.uri, 'bolt://127.0.0.1:7687');
  assert.equal(DEFAULTS.semanticMinSim, 0.72);
});

test.after(() => {
  pool.query = originalQuery;
});
