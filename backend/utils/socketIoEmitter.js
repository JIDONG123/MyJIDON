/**
 * 跨进程 Socket.IO 推送（Worker / 独立脚本 → HTTP 进程的 Socket 房间）
 * 与 @socket.io/redis-adapter 共用 REDIS_* 与 SOCKET_IO_REDIS_KEY
 */
const { resolveSocketRedisUrl } = require('./socketIoRedis');

function trimEnv(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

let emitterRef = null;
let initPromise = null;

async function initSocketIoEmitter() {
  if (emitterRef) return emitterRef;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const url = resolveSocketRedisUrl();
    if (!url) {
      console.warn('[socket-emitter] Redis 未配置，Worker 无法推送实时进度（请配置 REDIS_URL）');
      return null;
    }
    try {
      const { createClient } = require('redis');
      const { Emitter } = require('@socket.io/redis-emitter');
      const client = createClient({ url });
      client.on('error', (err) => {
        console.warn('[socket-emitter]', err?.message || err);
      });
      await client.connect();
      const key = trimEnv(process.env.SOCKET_IO_REDIS_KEY) || 'sg:socket.io';
      emitterRef = new Emitter(client, { key });
      console.log(`[socket-emitter] ready (key=${key}) → Worker 可广播 grading_job 进度`);
      return emitterRef;
    } catch (e) {
      console.warn('[socket-emitter] init failed:', e?.message || e);
      return null;
    }
  })();

  return initPromise;
}

function getSocketIoEmitter() {
  return emitterRef;
}

module.exports = {
  initSocketIoEmitter,
  getSocketIoEmitter,
};
