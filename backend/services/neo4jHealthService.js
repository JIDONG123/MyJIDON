/**
 * Neo4j 连接健康检查与图谱统计
 */

const { getKgConfig, recordKgTestResult } = require('./kgConfigService');

function mapNeo4jError(error) {
  const raw = String(error?.message || error || '');
  const msg = raw.toLowerCase();

  if (!raw.trim()) return 'Neo4j 连接失败';
  if (msg.includes('password') && msg.includes('not configured')) {
    return 'Neo4j 密码未配置';
  }
  if (
    msg.includes('econnrefused') ||
    msg.includes('connection refused') ||
    msg.includes('connect econnrefused') ||
    msg.includes('service unavailable') ||
    msg.includes('failed to establish connection')
  ) {
    return 'Neo4j 服务未启动或 bolt 地址不可达，请检查 URI 与端口 7687';
  }
  if (
    msg.includes('authentication') ||
    msg.includes('unauthorized') ||
    msg.includes('invalid credentials') ||
    msg.includes('authentication failure')
  ) {
    return '用户名或密码错误';
  }
  if (
    msg.includes('database') &&
    (msg.includes('not found') || msg.includes('does not exist') || msg.includes('unknown database'))
  ) {
    return '数据库不存在，请检查数据库名称';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return '连接超时，请检查网络或防火墙设置';
  }
  if (msg.includes('getaddrinfo') || msg.includes('enotfound')) {
    return '无法解析 Neo4j 主机地址，请检查 URI';
  }
  return 'Neo4j 连接失败：服务不可达、认证失败或数据库不存在';
}

async function withEphemeralDriver(cfg, fn) {
  let neo4j;
  try {
    neo4j = require('neo4j-driver');
  } catch {
    throw new Error('未安装 neo4j-driver，请在后端目录执行 npm install neo4j-driver');
  }

  const driver = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.user, cfg.password), {
    maxConnectionPoolSize: cfg.poolSize || 20,
  });

  try {
    await driver.verifyConnectivity();
    return await fn(driver, cfg.database);
  } finally {
    await driver.close();
  }
}

async function testNeo4jConnection() {
  const cfg = await getKgConfig();
  if (!cfg.password) {
    const err = new Error('Neo4j 密码未配置');
    err.statusCode = 400;
    throw err;
  }

  const started = Date.now();
  try {
    await withEphemeralDriver(cfg, async (driver, database) => {
      const session = driver.session({ database });
      try {
        await session.executeRead((tx) => tx.run('RETURN 1 AS ok'));
      } finally {
        await session.close();
      }
    });
    const elapsedMs = Date.now() - started;
    return {
      status: 'success',
      database: cfg.database,
      elapsedMs,
      message: 'Neo4j 连接正常',
    };
  } catch (e) {
    const elapsedMs = Date.now() - started;
    const message = mapNeo4jError(e);
    const err = new Error(`Neo4j 连接失败：${message}`);
    err.statusCode = 502;
    err.elapsedMs = elapsedMs;
    err.database = cfg.database;
    throw err;
  }
}

async function testNeo4jStats() {
  const cfg = await getKgConfig();
  if (!cfg.password) {
    const err = new Error('Neo4j 密码未配置');
    err.statusCode = 400;
    throw err;
  }

  const started = Date.now();
  try {
    const stats = await withEphemeralDriver(cfg, async (driver, database) => {
      const session = driver.session({ database });
      try {
        const nodeRes = await session.executeRead((tx) =>
          tx.run('MATCH (n) RETURN count(n) AS nodeCount')
        );
        const relRes = await session.executeRead((tx) =>
          tx.run('MATCH ()-[r]->() RETURN count(r) AS relationCount')
        );
        const nodeCount = Number(nodeRes.records[0]?.get('nodeCount')) || 0;
        const relationCount = Number(relRes.records[0]?.get('relationCount')) || 0;
        return { nodeCount, relationCount };
      } finally {
        await session.close();
      }
    });

    const elapsedMs = Date.now() - started;
    return {
      status: 'success',
      database: cfg.database,
      elapsedMs,
      nodeCount: stats.nodeCount,
      relationCount: stats.relationCount,
      message: 'Neo4j 连接正常',
    };
  } catch (e) {
    const elapsedMs = Date.now() - started;
    const message = mapNeo4jError(e);
    const err = new Error(`Neo4j 连接失败：${message}`);
    err.statusCode = 502;
    err.elapsedMs = elapsedMs;
    err.database = cfg.database;
    throw err;
  }
}

async function testNeo4jConnectionAndStats() {
  const cfg = await getKgConfig();
  if (!cfg.enabled && !cfg.password) {
    const err = new Error('Neo4j 密码未配置');
    err.statusCode = 400;
    throw err;
  }
  if (!cfg.password) {
    const err = new Error('Neo4j 密码未配置');
    err.statusCode = 400;
    throw err;
  }

  const started = Date.now();
  try {
    const result = await testNeo4jStats();
    await recordKgTestResult({
      status: 'success',
      message: result.message,
      nodeCount: result.nodeCount,
      relationCount: result.relationCount,
    });
    return result;
  } catch (e) {
    const message = mapNeo4jError(e);
    await recordKgTestResult({
      status: 'failed',
      message,
    });
    const err = new Error(`Neo4j 连接失败：${message}`);
    err.statusCode = e.statusCode || 502;
    err.elapsedMs = e.elapsedMs ?? Date.now() - started;
    err.database = cfg.database;
    throw err;
  }
}

async function reconnectNeo4jDriverIfNeeded() {
  try {
    const kgNeo4j = require('../utils/kgNeo4jClient');
    await kgNeo4j.reconnectDriver();
    return { reconnected: true };
  } catch {
    return { reconnected: false, needsRestart: true };
  }
}

module.exports = {
  mapNeo4jError,
  testNeo4jConnection,
  testNeo4jStats,
  testNeo4jConnectionAndStats,
  reconnectNeo4jDriverIfNeeded,
};
