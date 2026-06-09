/**
 * Neo4j Bolt 客户端（知识图谱专用，与 MariaDB 业务库隔离）
 */

const { getKgConfig } = require('../services/kgConfigService');

let driver = null;
let driverFingerprint = null;

function fingerprint(cfg) {
  return `${cfg.uri}|${cfg.user}|${cfg.password}|${cfg.database}|${cfg.poolSize}`;
}

async function isKgNeo4jEnabled() {
  const cfg = await getKgConfig();
  return Boolean(cfg.enabled && cfg.password);
}

/** @deprecated 请使用 getKgConfig() */
async function getConfig() {
  const cfg = await getKgConfig();
  return {
    uri: cfg.uri,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  };
}

async function reconnectDriver() {
  await closeDriver();
  return getDriver();
}

async function getDriver() {
  const cfg = await getKgConfig();
  if (!cfg.enabled || !cfg.password) return null;

  const fp = fingerprint(cfg);
  if (driver && driverFingerprint === fp) return driver;

  if (driver) {
    await closeDriver();
  }

  let neo4j;
  try {
    neo4j = require('neo4j-driver');
  } catch {
    throw new Error('未安装 neo4j-driver，请在后端目录执行 npm install neo4j-driver');
  }

  driver = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.user, cfg.password), {
    maxConnectionPoolSize: cfg.poolSize || 20,
  });
  driverFingerprint = fp;
  await driver.verifyConnectivity();
  return driver;
}

async function runWrite(cypher, params = {}) {
  const d = await getDriver();
  if (!d) return { skipped: true };
  const cfg = await getKgConfig();
  const session = d.session({ database: cfg.database });
  try {
    const result = await session.executeWrite((tx) => tx.run(cypher, params));
    return { skipped: false, summary: result.summary };
  } finally {
    await session.close();
  }
}

async function runRead(cypher, params = {}) {
  const d = await getDriver();
  if (!d) return [];
  const cfg = await getKgConfig();
  const session = d.session({ database: cfg.database });
  try {
    const result = await session.executeRead((tx) => tx.run(cypher, params));
    return result.records.map((r) => r.toObject());
  } finally {
    await session.close();
  }
}

async function upsertGraphBatch(nodes, relationships) {
  if (!(await isKgNeo4jEnabled()) || !nodes.length) return { skipped: true };
  await runWrite(
    `
    UNWIND $nodes AS n
    MERGE (x:KgNode {id: n.id})
    SET x.name = n.name, x.type = n.type, x.updatedAt = datetime()
    `,
    { nodes }
  );
  if (relationships.length) {
    await runWrite(
      `
      UNWIND $rels AS r
      MATCH (a:KgNode {id: r.from})
      MATCH (b:KgNode {id: r.to})
      MERGE (a)-[e:KG_REL {type: r.type}]->(b)
      SET e.weight = coalesce(r.weight, 1.0), e.updatedAt = datetime()
      `,
      { rels: relationships }
    );
  }
  return { skipped: false };
}

async function countGraph() {
  if (!(await isKgNeo4jEnabled())) return { nodes: 0, edges: 0, skipped: true };
  const rows = await runRead(
    `MATCH (n:KgNode) WITH count(n) AS nodes
     OPTIONAL MATCH ()-[r:KG_REL]->() WITH nodes, count(r) AS edges
     RETURN nodes, edges`
  );
  const row = rows[0] || {};
  return {
    nodes: Number(row.nodes) || 0,
    edges: Number(row.edges) || 0,
    skipped: false,
  };
}

async function closeDriver() {
  if (driver) {
    await driver.close();
    driver = null;
    driverFingerprint = null;
  }
}

module.exports = {
  isKgNeo4jEnabled,
  getConfig,
  getDriver,
  reconnectDriver,
  runWrite,
  runRead,
  upsertGraphBatch,
  countGraph,
  closeDriver,
};
