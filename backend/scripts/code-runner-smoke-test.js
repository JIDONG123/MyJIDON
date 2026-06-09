#!/usr/bin/env node
/**
 * Phase A smoke test：inline Python main.py（需独立 Worker 进程 + CODE_RUNNER_ENABLED=1）
 *
 * 用法：
 *   终端 1: CODE_RUNNER_ENABLED=1 npm run worker:code-runner
 *   终端 2: CODE_RUNNER_ENABLED=1 npm run smoke:code-runner
 *
 * 无 Redis 时可用同步模式（跳过队列，直接调用 processor，仅验 adapter）：
 *   CODE_RUNNER_ENABLED=1 npm run smoke:code-runner -- --sync
 */
require('../config/loadEnv').loadEnv();
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

const pool = require('../config/database');
const { bootstrapDatabase } = require('../db/bootstrap');
const { isCodeRunnerEnabled, getRunnerMode } = require('../utils/codeRunConfig');
const { processCodeRunJob } = require('../utils/codeRunProcessor');
const { createInlineJob, getJobById, getResultByJobId } = require('../services/codeRunService');

const USE_SYNC = process.argv.includes('--sync');

const HELLO_SOURCE = `print("Hello from Code Runner")
print(6 * 7)
`;

const FAIL_SOURCE = `print("before error")
raise ValueError("expected failure")
`;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForJob(jobId, maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const job = await getJobById(jobId);
    if (!job) throw new Error(`job ${jobId} 不存在`);
    if (['completed', 'failed', 'timeout', 'cancelled'].includes(job.status)) {
      const result = await getResultByJobId(jobId);
      return { job, result };
    }
    await sleep(500);
  }
  throw new Error(`job ${jobId} 等待超时（${maxWaitMs}ms），请确认 worker:code-runner 已启动`);
}

async function resolveAdminId() {
  const [rows] = await pool.query("SELECT id FROM users WHERE username='admin' LIMIT 1");
  if (!rows[0]) throw new Error('未找到 admin 用户');
  return rows[0].id;
}

async function runCase(name, sourceCode, expectStatus) {
  const createdBy = await resolveAdminId();
  const { jobId, transport } = await createInlineJob({
    language: 'python',
    sourceCode,
    createdBy,
    scopeType: 'manual',
    timeoutSec: 10,
    skipEnqueue: USE_SYNC,
  });
  console.log(`[${name}] job #${jobId} via ${transport?.transport || transport}`);

  if (USE_SYNC) {
    await processCodeRunJob(jobId);
  }

  const { job, result } = await waitForJob(jobId, USE_SYNC ? 5000 : 60000);
  console.log(`[${name}] status=${job.status} summary=${result?.summary || job.message}`);

  if (job.status !== expectStatus) {
    throw new Error(`[${name}] 期望 status=${expectStatus}，实际 ${job.status}`);
  }
  if (expectStatus === 'completed') {
    if (!result || !String(result.stdout || '').includes('Hello from Code Runner')) {
      throw new Error(`[${name}] stdout 不符合预期: ${result?.stdout}`);
    }
    if (!String(result.stdout || '').includes('42')) {
      throw new Error(`[${name}] 未看到 6*7 输出`);
    }
  }
  return { job, result };
}

(async () => {
  try {
    if (!isCodeRunnerEnabled()) {
      console.error('请设置 CODE_RUNNER_ENABLED=1 后再运行 smoke test');
      process.exit(1);
    }

    await bootstrapDatabase();
    console.log('[smoke] mode=%s sync=%s', getRunnerMode(), USE_SYNC);

    await runCase('hello', HELLO_SOURCE, 'completed');
    await runCase('fail-exit', FAIL_SOURCE, 'failed');

    console.log('[smoke] PASS — inline Python main.py 运行检查通过');
    process.exit(0);
  } catch (e) {
    console.error('[smoke] FAIL', e.message || e);
    process.exit(1);
  }
})();
