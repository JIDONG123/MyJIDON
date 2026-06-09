/**
 * Socket.IO 跨进程广播：node-redis + @socket.io/redis-adapter
 *
 * - 与业务缓存用的 ioredis（redisClient.js）隔离，仅共用 REDIS_* 环境变量解析规则。
 * - 连接失败或未配置时自动使用内存适配器，不抛错、不中断 HTTP/Socket 启动。
 *
 * 环境变量（优先级）：
 * 1) REDIS_URL
 * 2) REDIS_HOST + REDIS_PORT（+ 可选 REDIS_PASSWORD、REDIS_DB）
 * 3) 开发环境：无 URL/HOST 时可探测本机 redis（见 resolveSocketRedisUrl）
 *
 * 可选：
 * - SOCKET_IO_REDIS_KEY        适配器 Redis 键前缀（默认 sg:socket.io），多应用共库时区分
 * - SOCKET_IO_REDIS_CONNECT_MS 连接超时毫秒（开发默认 2000，其它默认 8000）
 * - SOCKET_IO_REDIS_DEV_PROBE  开发环境是否探测 127.0.0.1（默认 1；设 0 关闭）
 */

function trimEnv(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function redisExplicitlyDisabled() {
  const v = trimEnv(process.env.REDIS_ENABLED);
  return v === '0' || v === 'false';
}

/**
 * 解析供 node-redis 使用的连接 URL；未配置且不满足开发探测条件时返回 null。
 */
function resolveSocketRedisUrl() {
  if (redisExplicitlyDisabled()) {
    return null;
  }

  const direct = trimEnv(process.env.REDIS_URL);
  if (direct) {
    return direct;
  }

  const host = trimEnv(process.env.REDIS_HOST);
  if (host) {
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const safePort = Number.isFinite(port) && port > 0 ? port : 6379;
    const passRaw = trimEnv(process.env.REDIS_PASSWORD);
    const pass = passRaw ? `:${encodeURIComponent(passRaw)}@` : '';
    const dbRaw = trimEnv(process.env.REDIS_DB);
    const db = dbRaw != null ? dbRaw : '0';
    return `redis://${pass}${host}:${safePort}/${db}`;
  }

  const probe =
    trimEnv(process.env.SOCKET_IO_REDIS_DEV_PROBE) !== '0' &&
    trimEnv(process.env.SOCKET_IO_REDIS_DEV_PROBE) !== 'false';
  if (process.env.NODE_ENV === 'development' && probe) {
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const safePort = Number.isFinite(port) && port > 0 ? port : 6379;
    return `redis://127.0.0.1:${safePort}/0`;
  }

  return null;
}

async function safeQuit(client) {
  if (!client) return;
  try {
    if (client.isOpen) {
      await client.quit();
    } else {
      client.disconnect();
    }
  } catch {
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

let loggedSkipAdapter = false;
let loggedAdapterFail = false;

function maskRedisUrl(u) {
  try {
    const x = String(u);
    return x.replace(/:\/\/([^:/?#]+):([^@/?#]+)@/, '://$1:****@');
  } catch {
    return '(redis url)';
  }
}

/**
 * 为 Socket.IO Server 挂载 Redis 适配器；失败则保持默认内存适配器。
 * @param {import('socket.io').Server} io
 * @returns {Promise<boolean>} 是否已启用 Redis 适配器
 */
async function attachSocketIoRedisAdapter(io) {
  const url = resolveSocketRedisUrl();
  if (!url) {
    if (!loggedSkipAdapter) {
      loggedSkipAdapter = true;
      console.info(
        '[socket] Redis adapter skipped → in-memory (set REDIS_URL or REDIS_HOST; dev 下无配置时会短时探测 127.0.0.1)'
      );
    }
    return false;
  }

  const isDev = process.env.NODE_ENV === 'development';
  const connectMs = parseInt(
    process.env.SOCKET_IO_REDIS_CONNECT_MS || (isDev ? '2000' : '8000'),
    10
  );
  const timeoutMs = Number.isFinite(connectMs) && connectMs > 0 ? connectMs : 8000;

  let pubClient;
  let subClient;

  try {
    const { createClient } = require('redis');
    const { createAdapter } = require('@socket.io/redis-adapter');

    const clientOptions = {
      url,
      socket: {
        connectTimeout: timeoutMs,
      },
      disableOfflineQueue: true,
    };

    pubClient = createClient(clientOptions);
    subClient = pubClient.duplicate();

    const quietErr = (label) => (err) => {
      if (err) {
        console.warn(`[socket][redis-${label}]`, err.message || String(err));
      }
    };
    pubClient.on('error', quietErr('pub'));
    subClient.on('error', quietErr('sub'));

    const withTimeout = (p, ms, label) =>
      Promise.race([
        p,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`${label} connect timeout ${ms}ms`)), ms);
        }),
      ]);

    await withTimeout(pubClient.connect(), timeoutMs, 'pub');
    await withTimeout(subClient.connect(), timeoutMs, 'sub');

    const key = trimEnv(process.env.SOCKET_IO_REDIS_KEY) || 'sg:socket.io';
    io.adapter(
      createAdapter(pubClient, subClient, {
        key,
        requestsTimeout: Math.min(15000, Math.max(5000, timeoutMs * 2)),
        publishOnSpecificResponseChannel: true,
      })
    );

    console.log(
      `[socket] Redis adapter ON (${maskRedisUrl(url)}) key=${key} → cluster / systemd / Docker 跨进程广播`
    );
    return true;
  } catch (e) {
    await safeQuit(pubClient);
    await safeQuit(subClient);
    if (!loggedAdapterFail) {
      loggedAdapterFail = true;
      console.warn('[socket] Redis adapter unavailable → in-memory mode:', e && e.message ? e.message : e);
    }
    return false;
  }
}

module.exports = {
  resolveSocketRedisUrl,
  attachSocketIoRedisAdapter,
};
