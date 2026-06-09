/**
 * Redis List 代码运行任务队列（对标 gradingJobQueue）
 */
const { ensureConnected } = require('./redisClient');

const QUEUE_KEY = process.env.CODE_RUNNER_QUEUE_KEY || 'sg:code_run:jobs';

const memQueue = [];
let memProcessing = false;
let memProcessor = null;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

async function enqueueCodeRunJob(jobId) {
  const id = Number(jobId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('无效 code run jobId');
  }

  const redis = await ensureConnected();
  if (redis) {
    await redis.lpush(QUEUE_KEY, String(id));
    return { transport: 'redis' };
  }

  if (isProduction()) {
    throw new Error('Redis 不可用，生产环境无法入队代码运行任务，请检查 REDIS_URL / REDIS_HOST');
  }

  memQueue.push(id);
  if (typeof memProcessor === 'function') {
    scheduleMemoryDrain();
  }
  console.warn('[codeRunJobQueue] Redis 不可用，使用开发环境内存队列（单进程）');
  return { transport: 'memory' };
}

/**
 * @param {number} timeoutSec BRPOP 阻塞秒数
 * @returns {Promise<number|null>}
 */
async function dequeueCodeRunJob(timeoutSec = 5) {
  const redis = await ensureConnected();
  if (redis) {
    const r = await redis.brpop(QUEUE_KEY, timeoutSec);
    if (!r || !r[1]) return null;
    const nid = Number(r[1]);
    return Number.isFinite(nid) ? nid : null;
  }

  if (isProduction()) {
    await sleep(timeoutSec * 1000);
    return null;
  }

  if (!memQueue.length) {
    await sleep(Math.min(timeoutSec * 1000, 1000));
    return null;
  }
  return memQueue.shift();
}

function registerMemoryProcessor(fn) {
  memProcessor = fn;
  scheduleMemoryDrain();
}

function scheduleMemoryDrain() {
  if (memProcessing || !memProcessor || !memQueue.length) return;
  memProcessing = true;
  (async () => {
    try {
      while (memQueue.length) {
        const jobId = memQueue.shift();
        if (jobId != null) {
          await memProcessor(jobId);
        }
      }
    } catch (e) {
      console.error('[codeRunJobQueue] memory processor error', e);
    } finally {
      memProcessing = false;
      if (memQueue.length) scheduleMemoryDrain();
    }
  })();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  QUEUE_KEY,
  enqueueCodeRunJob,
  dequeueCodeRunJob,
  registerMemoryProcessor,
};
