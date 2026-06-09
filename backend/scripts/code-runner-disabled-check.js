#!/usr/bin/env node
/** 服务端 CODE_RUNNER_ENABLED=0 时 POST /api/code-run/jobs 应返回 503（需 HTTP 已启动） */
require('../config/loadEnv').loadEnv();

const BASE = `http://127.0.0.1:${process.env.PORT || 3000}`;

(async () => {
  try {
    const res = await fetch(`${BASE}/api/code-run/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer invalid' },
      body: '{}',
    });
    const json = await res.json().catch(() => ({}));
    console.log('[disabled]', res.status, json.code || json.message);
    if (res.status !== 503) {
      throw new Error(`期望 503（功能关闭），实际 ${res.status} — 请确认服务端未设置 CODE_RUNNER_ENABLED=1`);
    }
    console.log('[code-run-disabled] PASS');
    process.exit(0);
  } catch (e) {
    console.error('[code-run-disabled] FAIL', e.message || e);
    process.exit(1);
  }
})();
