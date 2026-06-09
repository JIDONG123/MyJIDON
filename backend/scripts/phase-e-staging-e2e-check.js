#!/usr/bin/env node
/**
 * Phase E：Staging 7 条主流程 API 回归（CODE_RUNNER_ENABLED=0 下）
 * 不替代浏览器目视，但覆盖关键 API 契约与权限。
 *
 * 用法：cd backend && npm run phase-e:staging-e2e
 */
require('../config/loadEnv').loadEnv();

const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const BASE = `http://127.0.0.1:${process.env.PORT || 3000}`;

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed += 1;
  const msg = detail ? `${name}: ${detail}` : name;
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
}

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
    headers: { Authorization: `Bearer ${token}` },
  };
  if (body != null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

(async () => {
  console.log('\n=== Phase E Staging 7-flow API check ===');
  const admin = await tokenFor('admin');
  const teacher = await tokenFor('test-teacher-02');
  const student = await tokenFor('test-student-01');
  const student03 = await tokenFor('test-student-03');
  const enterprise = await tokenFor('test-enterprise-02');

  // 0. Code runner 关闭
  const cr = await fetch(`${BASE}/api/code-run/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer x' },
    body: '{}',
  });
  if (cr.status === 503) ok('code-run POST → 503（功能关闭）');
  else fail('code-run POST → 503', `HTTP ${cr.status}`);

  const op = await api('GET', '/api/online-practice/templates', teacher);
  if (op.status === 503) ok('online-practice templates → 503（功能关闭）');
  else fail('online-practice templates → 503', `HTTP ${op.status}`);

  // 1. 课程监管 / 教学班
  const tc = await api('GET', '/api/teaching-classes', admin);
  if (tc.status === 200 && tc.json.success) ok('flow1 admin 教学班列表 200');
  else fail('flow1 admin 教学班', `HTTP ${tc.status} ${tc.json.message || ''}`);

  // 2. 教师任务列表
  const tasks = await api('GET', '/api/tasks', teacher);
  const taskList = tasks.json?.data;
  if (tasks.status === 200 && tasks.json.success && Array.isArray(taskList) && taskList.length)
    ok(`flow2 teacher 任务列表 200 (${taskList.length} 条)`);
  else fail('flow2 teacher 任务列表', `HTTP ${tasks.status}`);

  // 3. 实训中心（学生任务 + 提交能力）
  const stTasks = await api('GET', '/api/tasks', student);
  if (stTasks.status === 200 && stTasks.json.success) ok('flow3 student 实训任务列表 200');
  else fail('flow3 student 任务列表', `HTTP ${stTasks.status}`);

  const [subRow] = await pool.query(
    'SELECT id, task_id FROM submissions WHERE student_id=(SELECT id FROM users WHERE username=?) ORDER BY id DESC LIMIT 1',
    ['test-student-01']
  );
  if (subRow[0]?.id) ok(`flow3 student 历史提交存在 sub #${subRow[0].id}`);
  else fail('flow3 student 提交', '无历史提交记录');

  // 4. AI 批改 / 教师复核（种子 sub #10）
  const gr = await api('GET', '/api/grading/10', teacher);
  if (gr.status === 200 && gr.json.success) {
    const st = gr.json.data?.status;
    ok(`flow4 teacher 批改结果 sub#10 200 status=${st || '?'}`);
  } else fail('flow4 teacher 批改 sub#10', `HTTP ${gr.status}`);

  // 5. 学生成绩报告
  const rep = await api('GET', '/api/grading/10', student03);
  if (rep.status === 200 && rep.json.success) {
    const final = rep.json.data?.finalScore ?? rep.json.data?.totalScore;
    ok(`flow5 student 成绩报告 sub#10 200 final=${final ?? '?'}`);
  } else fail('flow5 student 成绩报告', `HTTP ${rep.status}`);

  const pdf = await fetch(`${BASE}/api/reports/personal/10/pdf`, {
    headers: { Authorization: `Bearer ${student03}` },
  });
  if (pdf.status === 200) ok('flow5 student PDF 报告 200');
  else fail('flow5 student PDF', `HTTP ${pdf.status}`);

  // 6. 企业评分（GET 批改结果，与 Vue 企业端一致）
  const ent = await api('GET', '/api/grading/10', enterprise);
  if (ent.status === 200 && ent.json.success) {
    const esc = ent.json.data?.enterpriseScore;
    ok(`flow6 enterprise 批改结果 sub#10 200 enterpriseScore=${esc ?? '?'}`);
  } else fail('flow6 enterprise 批改结果', `HTTP ${ent.status}`);

  // 7. 数据大屏 / 管理统计
  const bs = await api('GET', '/api/dashboard/big-screen', admin);
  if (bs.status === 200 && bs.json.success && bs.json.data?.overview) ok('flow7 admin 数据大屏 200');
  else fail('flow7 admin 数据大屏', `HTTP ${bs.status}`);

  const dash = await api('GET', '/api/dashboard/stats', admin);
  if (dash.status === 200 && dash.json.success) ok('flow7 admin dashboard/stats 200');
  else fail('flow7 admin dashboard/stats', `HTTP ${dash.status}`);

  console.log(`\n=== 结果：${passed} 通过，${failed} 失败 ===`);
  if (failures.length) {
    failures.forEach((f) => console.error('  -', f));
    process.exit(1);
  }
  await pool.end();
})().catch(async (e) => {
  console.error('ERROR', e);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
