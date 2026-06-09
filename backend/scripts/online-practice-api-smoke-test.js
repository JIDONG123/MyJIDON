#!/usr/bin/env node
/**
 * Phase B+ API smoke：在线实训模板 + attempt + 运行（复用 code-run 队列）
 *
 * 前置：Redis + Worker + Backend（均 CODE_RUNNER_ENABLED=1）
 * 用法：CODE_RUNNER_ENABLED=1 npm run smoke:online-practice-api
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

async function waitCodeRunResult(token, jobId, maxMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const r = await api('GET', `/api/code-run/jobs/${jobId}/result`, token);
    const st = r.json?.data?.status;
    if (['completed', 'failed', 'timeout', 'cancelled'].includes(st)) return r;
    await sleep(500);
  }
  throw new Error(`code-run job ${jobId} 超时`);
}

async function teachingClassIdByCode(code) {
  const [rows] = await pool.query(
    'SELECT id FROM teaching_classes WHERE class_code = ? ORDER BY id DESC LIMIT 1',
    [code]
  );
  if (!rows[0]) throw new Error(`教学班不存在: ${code}`);
  return rows[0].id;
}

(async () => {
  try {
    if (!isCodeRunnerEnabled()) {
      console.error('请设置 CODE_RUNNER_ENABLED=1');
      process.exit(1);
    }

    const teacherToken = await tokenFor('test-teacher-01');
    const studentToken = await tokenFor('test-student-01');
    const otherToken = await tokenFor('test-student-03');

    const tcId = await teachingClassIdByCode('TEST-JW-01');
    const stamp = Date.now();

    const created = await api('POST', '/api/online-practice/templates', teacherToken, {
      title: `Smoke Practice ${stamp}`,
      description: 'Phase B+ API smoke',
      language: 'python',
      starterCode: 'print("starter")\n',
      teachingClassId: tcId,
      codeRunTimeoutSec: 10,
    });
    console.log('[create-template]', created.status, created.json?.data?.id, created.json?.data?.status);
    if (created.status !== 201) throw new Error('创建模板失败');
    const templateId = created.json.data.id;

    const published = await api('POST', `/api/online-practice/templates/${templateId}/publish`, teacherToken);
    console.log('[publish]', published.status, published.json?.data?.status);
    if (published.status !== 200 || published.json?.data?.status !== 'published') {
      throw new Error('发布失败');
    }

    const listed = await api('GET', '/api/online-practice/templates', studentToken);
    const found = (listed.json?.data || []).some((t) => t.id === templateId);
    console.log('[student-list]', listed.status, 'found=', found);
    if (!found) throw new Error('学生列表未见到已发布模板');

    const detail = await api('GET', `/api/online-practice/templates/${templateId}`, studentToken);
    console.log('[student-detail]', detail.status, detail.json?.data?.solutionHint === undefined);
    if (detail.status !== 200) throw new Error('学生查看模板失败');
    if ('solutionHint' in (detail.json?.data || {})) {
      throw new Error('学生不应看到 solutionHint');
    }

    const deniedTpl = await api('GET', `/api/online-practice/templates/${templateId}`, otherToken);
    console.log('[other-student-template]', deniedTpl.status);
    if (deniedTpl.status !== 403) throw new Error(`其他学生查看模板应 403，实际 ${deniedTpl.status}`);

    const opened = await api('POST', `/api/online-practice/templates/${templateId}/open`, studentToken);
    console.log('[open]', opened.status, opened.json?.data?.attempt?.id);
    if (opened.status !== 200) throw new Error('open attempt 失败');
    const attemptId = opened.json.data.attempt.id;

    const source = 'print("online practice smoke OK")\nprint(10 + 5)\n';
    const saved = await api('PUT', `/api/online-practice/attempts/${attemptId}/source`, studentToken, {
      sourceCode: source,
    });
    console.log('[save-source]', saved.status);
    if (saved.status !== 200) throw new Error('保存代码失败');

    const deniedAttempt = await api('GET', `/api/online-practice/attempts/${attemptId}`, otherToken);
    console.log('[other-student-attempt]', deniedAttempt.status);
    if (deniedAttempt.status !== 403) {
      throw new Error(`其他学生访问 attempt 应 403，实际 ${deniedAttempt.status}`);
    }

    const run = await api('POST', `/api/online-practice/attempts/${attemptId}/run`, studentToken, {});
    console.log('[run]', run.status, run.json?.data);
    if (run.status !== 202 || !run.json?.data?.jobId) throw new Error('运行入队失败');

    const result = await waitCodeRunResult(studentToken, run.json.data.jobId);
    console.log(
      '[code-run-result]',
      result.json?.data?.status,
      result.json?.data?.result?.summary
    );
    if (result.json?.data?.status !== 'completed') throw new Error('运行未成功');
    if (!String(result.json?.data?.result?.stdout || '').includes('online practice smoke OK')) {
      throw new Error('stdout 不符合预期');
    }

    await pool.query('DELETE FROM online_practice_attempts WHERE template_id = ?', [templateId]);
    await pool.query('DELETE FROM online_practice_templates WHERE id = ?', [templateId]);

    console.log('[smoke-online-practice-api] PASS');
    process.exit(0);
  } catch (e) {
    console.error('[smoke-online-practice-api] FAIL', e.message || e);
    process.exit(1);
  }
})();
