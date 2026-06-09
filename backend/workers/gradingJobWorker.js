#!/usr/bin/env node
/**
 * AI 批改任务 Worker（Legacy Redis List，BULLMQ_ENABLED=0）
 *
 * BullMQ 模式：npm run worker:grading
 * Legacy 模式：npm run worker:grading:legacy
 */
require('../config/loadEnv').loadEnv();

const { bootstrapDatabase } = require('../db/bootstrap');
const { initSocketIoEmitter } = require('../utils/socketIoEmitter');
const { dequeueJob, registerMemoryProcessor } = require('../utils/gradingJobQueue');
const { processGradingJob, recoverAllStaleRunningItems } = require('../utils/gradingJobProcessor');
const { isBullmqEnabled } = require('../utils/bullmqGradingConfig');

const POLL_SEC = parseInt(process.env.GRADING_JOB_BRPOP_SEC || '5', 10);
let running = true;

async function loop() {
  while (running) {
    try {
      const jobId = await dequeueJob(POLL_SEC);
      if (jobId != null) {
        console.log('[gradingJobWorker] processing job', jobId);
        await processGradingJob(jobId);
        console.log('[gradingJobWorker] finished job', jobId);
      }
    } catch (e) {
      console.error('[gradingJobWorker] loop error', e.message || e);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

function shutdown() {
  running = false;
  console.log('[gradingJobWorker] shutting down…');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

(async () => {
  try {
    if (isBullmqEnabled()) {
      console.error(
        '[gradingJobWorker] BULLMQ_ENABLED=1，请使用 npm run worker:grading；legacy worker 不应与 BullMQ 同时消费'
      );
      process.exit(1);
    }
    await bootstrapDatabase();
    await initSocketIoEmitter();
    registerMemoryProcessor(processGradingJob);
    await recoverAllStaleRunningItems();
    console.log('[gradingJobWorker] started (Legacy Redis List + dev memory fallback)');
    await loop();
  } catch (e) {
    console.error('[gradingJobWorker] fatal', e);
    process.exit(1);
  }
})();
