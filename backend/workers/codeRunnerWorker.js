#!/usr/bin/env node
/**
 * 代码运行 Worker（独立进程，消费 Redis List）
 *
 * 开发：npm run worker:code-runner
 * 生产：systemd smart-grading-code-runner.service（与 HTTP / AI grading worker 分离）
 *
 * Express 主进程不得 spawn 学生代码；仅本 Worker 调用 Docker/Host adapter。
 */
require('../config/loadEnv').loadEnv();

const { bootstrapDatabase } = require('../db/bootstrap');
const { getBrpopSec, isCodeRunnerEnabled } = require('../utils/codeRunConfig');
const { dequeueCodeRunJob, registerMemoryProcessor } = require('../utils/codeRunJobQueue');
const { processCodeRunJob, recoverStaleRunningJobs } = require('../utils/codeRunProcessor');

const POLL_SEC = getBrpopSec();
let running = true;

async function loop() {
  while (running) {
    try {
      const jobId = await dequeueCodeRunJob(POLL_SEC);
      if (jobId != null) {
        console.log('[codeRunnerWorker] processing job', jobId);
        await processCodeRunJob(jobId);
        console.log('[codeRunnerWorker] finished job', jobId);
      }
    } catch (e) {
      console.error('[codeRunnerWorker] loop error', e.message || e);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

function shutdown() {
  running = false;
  console.log('[codeRunnerWorker] shutting down…');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

(async () => {
  try {
    await bootstrapDatabase();
    registerMemoryProcessor(processCodeRunJob);
    await recoverStaleRunningJobs();

    if (!isCodeRunnerEnabled()) {
      console.warn(
        '[codeRunnerWorker] CODE_RUNNER_ENABLED=0 — Worker 已启动但不会新建任务；队列中遗留 job 仍会消费'
      );
    } else {
      console.log('[codeRunnerWorker] CODE_RUNNER_ENABLED=1');
    }

    console.log('[codeRunnerWorker] started (mode=%s)', process.env.CODE_RUNNER_MODE || 'docker');
    await loop();
  } catch (e) {
    console.error('[codeRunnerWorker] fatal', e);
    process.exit(1);
  }
})();
