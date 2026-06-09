#!/usr/bin/env node
/**
 * AI 批改 BullMQ Worker（item-level 调度，独立进程）
 *
 * BullMQ 模式：npm run worker:grading
 * Legacy 模式：npm run worker:grading:legacy
 */
require('../config/loadEnv').loadEnv();

const { Worker } = require('bullmq');
const { bootstrapDatabase } = require('../db/bootstrap');
const { initSocketIoEmitter } = require('../utils/socketIoEmitter');
const { ensureConnected } = require('../utils/redisClient');
const { touchWorkerHeartbeat, closeGradingQueue } = require('../utils/gradingJobQueue');
const { processGradingJobItem } = require('../utils/gradingItemProcessor');
const { recoverAllStaleRunningItems } = require('../utils/gradingJobProcessor');
const {
  getQueueName,
  getBullmqPrefix,
  getItemConcurrency,
  isBullmqEnabled,
  getBullmqConnectionOptions,
} = require('../utils/bullmqGradingConfig');

let worker = null;
let heartbeatTimer = null;
let shuttingDown = false;

async function start() {
  if (!isBullmqEnabled()) {
    console.error(
      '[gradingBullmqWorker] BULLMQ_ENABLED=0，请使用 npm run worker:grading:legacy 或设置 BULLMQ_ENABLED=1'
    );
    process.exit(1);
  }

  const redis = await ensureConnected();
  if (!redis) {
    console.error('[gradingBullmqWorker] Redis 未连接，无法启动 BullMQ Worker。请检查 REDIS_URL / REDIS_HOST');
    process.exit(1);
  }

  await bootstrapDatabase();
  await initSocketIoEmitter();
  await recoverAllStaleRunningItems();

  const queueName = getQueueName();
  const concurrency = getItemConcurrency();
  const connection = getBullmqConnectionOptions(true);

  worker = new Worker(
    queueName,
    async (job) => {
      await touchWorkerHeartbeat();
      const data = job.data || {};
      return processGradingJobItem(data, {
        attempt: job.attemptsMade + 1,
        bullmqJobId: job.id,
      });
    },
    {
      connection,
      prefix: getBullmqPrefix(),
      concurrency,
    }
  );

  worker.on('completed', (job) => {
    console.info('[gradingBullmqWorker] completed', {
      bullmqJobId: job.id,
      gradingJobItemId: job.data?.gradingJobItemId,
      submissionId: job.data?.submissionId,
    });
  });

  worker.on('failed', (job, err) => {
    console.error('[gradingBullmqWorker] failed', {
      bullmqJobId: job?.id,
      gradingJobItemId: job?.data?.gradingJobItemId,
      submissionId: job?.data?.submissionId,
      errorType: err?.name || 'Error',
      message: String(err?.message || '').slice(0, 200),
    });
  });

  worker.on('stalled', (jobId) => {
    console.warn('[gradingBullmqWorker] stalled', { bullmqJobId: jobId });
  });

  worker.on('error', (err) => {
    console.error('[gradingBullmqWorker] worker error', err.message || err);
  });

  heartbeatTimer = setInterval(() => {
    touchWorkerHeartbeat().catch(() => {});
  }, 30000);

  console.log(
    `[gradingBullmqWorker] BullMQ grading worker started, queue=${queueName}, concurrency=${concurrency}`
  );
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[gradingBullmqWorker] shutting down…');
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (worker) {
    try {
      await worker.close();
    } catch {
      /* ignore */
    }
  }
  await closeGradingQueue();
}

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

start().catch((e) => {
  console.error('[gradingBullmqWorker] fatal', e);
  process.exit(1);
});
