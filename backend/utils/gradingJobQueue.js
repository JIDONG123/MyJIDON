/**
 * AI 批改队列：BullMQ（item-level）+ Legacy Redis List（job-level）双模式
 */
const { ensureConnected } = require('./redisClient');
const {
  isBullmqEnabled,
  getBullmqPrefix,
  getQueueName,
  getBullmqAttempts,
  getGradingBackoffMs,
  bullmqJobIdForItem,
  bullmqJobIdsForItem,
  getBullmqConnectionOptions,
} = require('./bullmqGradingConfig');

const QUEUE_KEY = process.env.GRADING_JOB_QUEUE_KEY || 'sg:grading:jobs';
const WORKER_HEARTBEAT_KEY = 'grading:worker:lastSeen';

let gradingQueue = null;
let queueInitFailed = false;

const memQueue = [];
let memProcessing = false;
let memProcessor = null;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

async function getGradingBullQueue() {
  if (queueInitFailed) return null;
  if (gradingQueue) return gradingQueue;
  if (!isBullmqEnabled()) return null;

  try {
    const { Queue } = require('bullmq');
    const connection = getBullmqConnectionOptions(false);
    gradingQueue = new Queue(getQueueName(), {
      connection,
      prefix: getBullmqPrefix(),
      defaultJobOptions: {
        attempts: getBullmqAttempts(),
        backoff: { type: 'exponential', delay: getGradingBackoffMs() },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      },
    });
    return gradingQueue;
  } catch (e) {
    queueInitFailed = true;
    console.error('[gradingJobQueue] BullMQ init failed:', e.message || e);
    return null;
  }
}

/**
 * Item-level 入队（BullMQ 模式）
 * @param {{ gradingJobId, gradingJobItemId, submissionId, taskId, retryCount?: number }} data
 */
async function enqueueGradingItem(data) {
  const itemId = Number(data.gradingJobItemId);
  if (!Number.isFinite(itemId) || itemId <= 0) {
    throw new Error('无效 gradingJobItemId');
  }
  const retryCount = Number(data.retryCount) || 0;

  if (isBullmqEnabled()) {
    const queue = await getGradingBullQueue();
    if (!queue) {
      throw new Error('BullMQ 已启用但队列初始化失败，请检查 Redis 连接与 bullmq 依赖');
    }
    await removeItemBullmqJobs(itemId, retryCount);
    const jobId = bullmqJobIdForItem(itemId, retryCount);
    await queue.add(
      'grading-item',
      {
        gradingJobId: Number(data.gradingJobId),
        gradingJobItemId: itemId,
        submissionId: Number(data.submissionId),
        taskId: Number(data.taskId),
        retryCount,
      },
      { jobId }
    );
    return { transport: 'bullmq', bullmqJobId: jobId };
  }

  return { transport: 'legacy-deferred' };
}

/**
 * Legacy：整 job 入 Redis List（BULLMQ_ENABLED=0）
 */
async function enqueueJob(jobId) {
  const id = Number(jobId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('无效 jobId');
  }

  if (isBullmqEnabled()) {
    return { transport: 'bullmq-items', jobId: id };
  }

  const redis = await ensureConnected();
  if (redis) {
    await redis.lpush(QUEUE_KEY, String(id));
    return { transport: 'redis-list' };
  }

  if (isProduction()) {
    throw new Error('Redis 不可用，生产环境无法入队 AI 批改任务，请检查 REDIS_URL / REDIS_HOST');
  }

  memQueue.push(id);
  if (typeof memProcessor === 'function') {
    scheduleMemoryDrain();
  }
  console.warn('[gradingJobQueue] Redis 不可用，使用开发环境内存队列（单进程）');
  return { transport: 'memory' };
}

async function enqueueJobItems(jobId, items, taskId) {
  if (!isBullmqEnabled()) {
    return enqueueJob(jobId);
  }
  const results = [];
  for (const row of items) {
    results.push(
      await enqueueGradingItem({
        gradingJobId: jobId,
        gradingJobItemId: row.id,
        submissionId: row.submission_id,
        taskId,
        retryCount: Number(row.retry_count) || 0,
      })
    );
  }
  return { transport: 'bullmq', count: results.length };
}

/**
 * 移除 item 关联的 BullMQ job（waiting/delayed/failed/completed 均可清，避免 jobId 冲突）
 */
async function removeItemBullmqJobs(itemId, retryCount = 0) {
  if (!isBullmqEnabled()) return 0;
  const queue = await getGradingBullQueue();
  if (!queue) return 0;
  const jobIds = bullmqJobIdsForItem(itemId, retryCount);
  let removed = 0;
  for (const jobId of jobIds) {
    try {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.remove();
        removed += 1;
      }
    } catch {
      /* ignore */
    }
  }
  return removed;
}

async function removeQueuedItemJobs(items = []) {
  if (!isBullmqEnabled() || !items.length) return 0;
  let removed = 0;
  for (const row of items) {
    const id = typeof row === 'object' ? row.id : row;
    const retryCount = typeof row === 'object' ? Number(row.retry_count) || 0 : 0;
    removed += await removeItemBullmqJobs(id, retryCount);
  }
  return removed;
}

async function dequeueJob(timeoutSec = 5) {
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
      console.error('[gradingJobQueue] memory processor error', e);
    } finally {
      memProcessing = false;
      if (memQueue.length) scheduleMemoryDrain();
    }
  })();
}

async function touchWorkerHeartbeat() {
  const redis = await ensureConnected();
  if (!redis) return;
  try {
    await redis.set(WORKER_HEARTBEAT_KEY, new Date().toISOString(), 'EX', 120);
  } catch {
    /* ignore */
  }
}

async function getWorkerHeartbeat() {
  const redis = await ensureConnected();
  if (!redis) return null;
  try {
    return await redis.get(WORKER_HEARTBEAT_KEY);
  } catch {
    return null;
  }
}

async function getQueueHealthStats() {
  if (!isBullmqEnabled()) {
    return { waiting: null, active: null, completed: null, failed: null };
  }
  const queue = await getGradingBullQueue();
  if (!queue) {
    return { waiting: null, active: null, completed: null, failed: null };
  }
  try {
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    return {
      waiting: (counts.waiting || 0) + (counts.delayed || 0),
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
    };
  } catch {
    return { waiting: null, active: null, completed: null, failed: null };
  }
}

async function closeGradingQueue() {
  if (gradingQueue) {
    try {
      await gradingQueue.close();
    } catch {
      /* ignore */
    }
    gradingQueue = null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  QUEUE_KEY,
  WORKER_HEARTBEAT_KEY,
  enqueueJob,
  enqueueGradingItem,
  enqueueJobItems,
  removeItemBullmqJobs,
  removeQueuedItemJobs,
  dequeueJob,
  registerMemoryProcessor,
  touchWorkerHeartbeat,
  getWorkerHeartbeat,
  getQueueHealthStats,
  closeGradingQueue,
  getGradingBullQueue,
};
