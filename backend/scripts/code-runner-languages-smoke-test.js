#!/usr/bin/env node
/**
 * 五语言 Code Runner smoke（成功 + 失败用例）
 *
 * 用法：
 *   CODE_RUNNER_ENABLED=1 npm run smoke:code-runner-languages
 *   CODE_RUNNER_ENABLED=1 npm run smoke:code-runner-languages -- --sync
 */
require('../config/loadEnv').loadEnv();
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

const fsp = require('fs').promises;
const path = require('path');
const pool = require('../config/database');
const { bootstrapDatabase } = require('../db/bootstrap');
const { isCodeRunnerEnabled, getRunnerMode } = require('../utils/codeRunConfig');
const { processCodeRunJob } = require('../utils/codeRunProcessor');
const { createInlineJob, getJobById, getResultByJobId } = require('../services/codeRunService');
const { allocateJobDir } = require('../utils/codeRunJobPaths');

const USE_SYNC = process.argv.includes('--sync');

const SUCCESS_SOURCES = {
  python: `print("LANG_OK_PYTHON")\nprint(2 + 3)\n`,
  node: `console.log("LANG_OK_NODE");\nconsole.log(2 + 3);\n`,
  c: `#include <stdio.h>\nint main(void){ printf("LANG_OK_C\\n"); printf("%d\\n", 2+3); return 0; }\n`,
  cpp: `#include <iostream>\nint main(){ std::cout << "LANG_OK_CPP\\n" << 5 << std::endl; return 0; }\n`,
  java: `public class Main { public static void main(String[] args){ System.out.println("LANG_OK_JAVA"); System.out.println(5); } }\n`,
};

const FAIL_SOURCES = {
  compile_error: {
    language: 'c',
    source: `int main() { return }\n`,
    expectStatus: 'failed',
    expectErrorKind: 'compile_error',
  },
  runtime_error: {
    language: 'python',
    source: `print("before_fail")\nraise RuntimeError("expected")\n`,
    expectStatus: 'failed',
    expectErrorKind: 'runtime_error',
  },
  timeout: {
    language: 'python',
    source: `import time\nwhile True:\n    time.sleep(1)\n`,
    expectStatus: 'timeout',
    expectErrorKind: 'timeout',
    timeoutSec: 2,
  },
};

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForJob(jobId, maxWaitMs = 120000) {
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

function errorKindFromJob(job) {
  const msg = String(job.error_message || job.message || '');
  const m = msg.match(/^\[(compile_error|runtime_error|timeout|entry_missing)\]/);
  return m ? m[1] : null;
}

async function runInlineCase(name, opts) {
  const createdBy = await resolveAdminId();
  const { jobId, transport } = await createInlineJob({
    language: opts.language,
    sourceCode: opts.sourceCode,
    createdBy,
    scopeType: 'manual',
    timeoutSec: opts.timeoutSec || 10,
    skipEnqueue: USE_SYNC,
  });

  if (!USE_SYNC && transport !== 'redis') {
    throw new Error(`[${name}] 期望 Redis 入队 transport=redis，实际 ${transport}`);
  }

  if (USE_SYNC) {
    await processCodeRunJob(jobId);
  }

  const { job, result } = await waitForJob(jobId, USE_SYNC ? 15000 : 120000);
  console.log(
    `[${name}] lang=${opts.language} job=#${jobId} transport=${USE_SYNC ? 'sync' : transport} status=${job.status} summary=${result?.summary || job.message}`
  );

  if (job.status !== opts.expectStatus) {
    throw new Error(`[${name}] 期望 status=${opts.expectStatus}，实际 ${job.status}`);
  }

  if (opts.expectMarker && result) {
    if (!String(result.stdout || '').includes(opts.expectMarker)) {
      throw new Error(`[${name}] stdout 缺少标记 ${opts.expectMarker}: ${result.stdout}`);
    }
  }

  if (opts.expectErrorKind) {
    const kind = errorKindFromJob(job);
    if (kind !== opts.expectErrorKind) {
      throw new Error(`[${name}] 期望 errorKind=${opts.expectErrorKind}，实际 ${kind || 'null'}`);
    }
  }

  if (opts.expectCompileFail && result && result.compile_exit_code === 0) {
    throw new Error(`[${name}] 期望编译失败`);
  }

  return { jobId, job, result };
}

async function runMissingEntryCase() {
  const createdBy = await resolveAdminId();
  const [insert] = await pool.query(
    `INSERT INTO code_run_jobs
      (scope_type, language, source_type, status, timeout_sec, created_by, message)
     VALUES ('manual', 'python', 'job_dir', 'pending', 5, ?, 'smoke missing entry')`,
    [createdBy]
  );
  const jobId = insert.insertId;
  const { relative, absolute } = await allocateJobDir(jobId);
  await fsp.writeFile(path.join(absolute, 'not_main.txt'), 'noop', { mode: 0o600 });
  await pool.query('UPDATE code_run_jobs SET job_dir = ? WHERE id = ?', [relative, jobId]);

  if (USE_SYNC) {
    await processCodeRunJob(jobId);
  } else {
    const { enqueueCodeRunJob } = require('../utils/codeRunJobQueue');
    const t = await enqueueCodeRunJob(jobId);
    if (t.transport !== 'redis') {
      throw new Error(`[missing-entry] 期望 Redis 入队 transport=redis，实际 ${t.transport}`);
    }
  }

  const { job, result } = await waitForJob(jobId, USE_SYNC ? 15000 : 120000);
  console.log(`[missing-entry] job=#${jobId} transport=${USE_SYNC ? 'sync' : 'redis'} status=${job.status} summary=${result?.summary || job.message}`);

  if (job.status !== 'failed') {
    throw new Error(`[missing-entry] 期望 failed，实际 ${job.status}`);
  }
  const kind = errorKindFromJob(job);
  if (kind !== 'entry_missing') {
    throw new Error(`[missing-entry] 期望 entry_missing，实际 ${kind}`);
  }
}

(async () => {
  try {
    if (!isCodeRunnerEnabled()) {
      console.error('请设置 CODE_RUNNER_ENABLED=1');
      process.exit(1);
    }

    await bootstrapDatabase();
    console.log('[smoke:languages] mode=%s sync=%s', getRunnerMode(), USE_SYNC);

    for (const [lang, source] of Object.entries(SUCCESS_SOURCES)) {
      await runInlineCase(`ok-${lang}`, {
        language: lang,
        sourceCode: source,
        expectStatus: 'completed',
        expectMarker: `LANG_OK_${lang.toUpperCase()}`,
      });
    }

    for (const [key, spec] of Object.entries(FAIL_SOURCES)) {
      await runInlineCase(`fail-${key}`, {
        language: spec.language,
        sourceCode: spec.source,
        expectStatus: spec.expectStatus,
        expectErrorKind: spec.expectErrorKind,
        timeoutSec: spec.timeoutSec,
        expectCompileFail: key === 'compile_error',
      });
    }

    await runMissingEntryCase();

    console.log('[smoke:languages] PASS — 五语言 + 失败用例全部通过');
    process.exit(0);
  } catch (e) {
    console.error('[smoke:languages] FAIL', e.message || e);
    process.exit(1);
  }
})();
