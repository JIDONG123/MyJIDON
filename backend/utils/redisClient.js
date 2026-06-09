/**
 * 可选 Redis：未配置或连接失败时全部降级为 null，业务走 MySQL。
 */
let client = null;
let initAttempted = false;
let lastErrorLog = 0;

function shouldEnable() {
  if (process.env.REDIS_ENABLED === '0' || process.env.REDIS_ENABLED === 'false') {
    return false;
  }
  return Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
}

function logRedisErrorOnce(err) {
  const now = Date.now();
  if (now - lastErrorLog > 60000) {
    lastErrorLog = now;
    console.warn('[redis] unavailable, using DB only:', err && err.message ? err.message : err);
  }
}

function createClient() {
  const Redis = require('ioredis');
  const url = process.env.REDIS_URL;
  const opts = url
    ? { lazyConnect: true, maxRetriesPerRequest: 2, enableReadyCheck: true }
    : {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0', 10),
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000', 10),
        enableReadyCheck: true,
        retryStrategy(times) {
          if (times > 5) return null;
          return Math.min(times * 200, 2000);
        },
      };

  const c = url ? new Redis(url, opts) : new Redis(opts);
  c.on('error', (e) => logRedisErrorOnce(e));
  return c;
}

function getRedis() {
  if (!shouldEnable()) {
    return null;
  }
  if (client) {
    return client;
  }
  if (initAttempted) {
    return null;
  }
  initAttempted = true;
  try {
    client = createClient();
    return client;
  } catch (e) {
    logRedisErrorOnce(e);
    client = null;
    return null;
  }
}

async function ensureConnected() {
  const c = getRedis();
  if (!c) return null;
  try {
    if (c.status === 'wait' || c.status === 'end') {
      await c.connect();
    }
    await c.ping();
    return c;
  } catch (e) {
    logRedisErrorOnce(e);
    return null;
  }
}

async function safeGet(key) {
  const c = await ensureConnected();
  if (!c) return null;
  try {
    return await c.get(key);
  } catch (e) {
    logRedisErrorOnce(e);
    return null;
  }
}

async function safeSet(key, value, ...args) {
  const c = await ensureConnected();
  if (!c) return false;
  try {
    if (args.length) {
      await c.set(key, value, ...args);
    } else {
      await c.set(key, value);
    }
    return true;
  } catch (e) {
    logRedisErrorOnce(e);
    return false;
  }
}

async function safeDel(...keys) {
  const c = await ensureConnected();
  if (!c || !keys.length) return;
  try {
    await c.del(...keys);
  } catch (e) {
    logRedisErrorOnce(e);
  }
}

/** 按前缀删除（SCAN，非阻塞） */
async function safeDelByPrefix(prefix) {
  const c = await ensureConnected();
  if (!c) return;
  try {
    let cursor = '0';
    do {
      const r = await c.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', '128');
      cursor = r[0];
      const ks = r[1];
      if (ks && ks.length) {
        await c.del(...ks);
      }
    } while (cursor !== '0');
  } catch (e) {
    logRedisErrorOnce(e);
  }
}

/** 关闭 Redis 连接（测试 / 脚本退出前调用） */
async function closeRedis() {
  if (!client) return;
  const c = client;
  client = null;
  initAttempted = false;
  try {
    if (c.status !== 'end') {
      await c.quit();
    }
  } catch {
    try {
      c.disconnect();
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  getRedis,
  ensureConnected,
  safeGet,
  safeSet,
  safeDel,
  safeDelByPrefix,
  closeRedis,
};
