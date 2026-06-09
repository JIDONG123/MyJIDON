#!/usr/bin/env node
/**
 * Phase B API smoke：POST /api/code-run/jobs → Redis 队列 → Worker → GET result
 *
 * 前置：
 *   终端 1: CODE_RUNNER_ENABLED=1 npm run worker:code-runner
 *   终端 2: CODE_RUNNER_ENABLED=1 npm run dev  （或 start:cluster）
 *   Redis 可用
 *
 * 用法：
 *   CODE_RUNNER_ENABLED=1 npm run smoke:code-runner-api
 */
require('../config/loadEnv').loadEnv();

const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { isCodeRunnerEnabled } = require('../utils/codeRunConfig');

const BASE = `http://127.0.0.1:${process.env.PORT || 3000}`;

async function tokenFor(username) {
  const [rows] = await pool.query('SELECT id, username, role FROM users WHERE username=? LIMIT 1', [
    username,
  ]);
  if (!rows[0]) throw new Error(`user not found: ${username}`);
  return jwt.sign(
    { id: rows[0].id, username: rows[0].username, role: rows[0].role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function api(method, path, token, body) {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body != null) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitResult(token, jobId, maxMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const r = await api('GET', `/api/code-run/jobs/${jobId}/result`, token);
    const st = r.json?.data?.status;
    if (['completed', 'failed', 'timeout', 'cancelled'].includes(st)) {
      return r;
    }
    await sleep(500);
  }
  throw new Error(`job ${jobId} 等待超时`);
}

(async () => {
  try {
    if (!isCodeRunnerEnabled()) {
      console.error('请设置 CODE_RUNNER_ENABLED=1');
      process.exit(1);
    }

    const studentToken = await tokenFor('test-student-01');
    const otherToken = await tokenFor('test-student-02');
    const teacherToken = await tokenFor('test-teacher-01');

    const source = 'print("API smoke OK")\nprint(2 + 3)\n';

    const created = await api('POST', '/api/code-run/jobs', studentToken, {
      language: 'python',
      sourceCode: source,
      timeoutSec: 10,
    });
    console.log('[create]', created.status, created.json);
    if (created.status !== 202 || !created.json?.data?.jobId) {
      throw new Error('POST /jobs 失败');
    }
    const jobId = created.json.data.jobId;

    const denied = await api('GET', `/api/code-run/jobs/${jobId}`, otherToken);
    if (denied.status !== 403) {
      throw new Error(`越权访问应 403，实际 ${denied.status}`);
    }
    console.log('[access] 其他学生 403 OK');

    const result = await waitResult(studentToken, jobId);
    console.log('[result]', result.status, result.json?.data?.status, result.json?.data?.result?.summary);
    if (result.json?.data?.status !== 'completed') {
      throw new Error(`期望 completed，实际 ${result.json?.data?.status}`);
    }
    if (!String(result.json?.data?.result?.stdout || '').includes('API smoke OK')) {
      throw new Error('stdout 不符合预期');
    }

    const listed = await api('GET', '/api/code-run/jobs?page=1&pageSize=5', teacherToken);
    if (listed.status !== 200) throw new Error('教师列表失败');
    const found = (listed.json?.data || []).some((j) => j.jobId === jobId);
    if (!found) console.warn('[list] 教师列表未含本 job（可能非关联 task，可接受）');
    else console.log('[list] 教师可见 job OK');

    console.log('[smoke-api] PASS');
    process.exit(0);
  } catch (e) {
    console.error('[smoke-api] FAIL', e.message || e);
    process.exit(1);
  }
})();
