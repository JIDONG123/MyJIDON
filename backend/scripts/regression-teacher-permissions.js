#!/usr/bin/env node
/**
 * 教师端任务权限 HTTP 回归（docs/08）
 *
 * 用法（需后端已启动且已 seed:test）：
 *   cd backend && npm run regression:teacher-permissions
 *
 * 可选：
 *   REGRESSION_BASE_URL=http://127.0.0.1:3000 npm run regression:teacher-permissions
 */
require('../config/loadEnv').loadEnv();

const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const { createUserSession } = require('../services/userSessionService');
const { PREFIX } = require('./seed-test-data.constants');

const BASE_DEFAULT = process.env.REGRESSION_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;

let passed = 0;
let failed = 0;
const failures = [];
let BASE = BASE_DEFAULT;
let ownedServer = null;

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

function expectStatus(name, actual, expected) {
  if (actual === expected) ok(name);
  else fail(name, `HTTP ${actual}, expected ${expected}`);
}

function expect(cond, name, detail) {
  if (cond) ok(name);
  else fail(name, detail);
}

async function getUser(username) {
  const [rows] = await pool.query(
    'SELECT id, username, role, class_id FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  return rows[0] || null;
}

async function makeToken(user) {
  const { sessionId } = await createUserSession(pool, {
    userId: user.id,
    loginIp: '127.0.0.1',
    userAgent: 'regression-teacher-permissions',
  });
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, sessionId },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
}

async function http(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  let json = null;
  if (ct.includes('application/json')) {
    json = await res.json().catch(() => null);
  }
  return { status: res.status, json };
}

async function ensureHttpServer() {
  try {
    const probe = await fetch(`${BASE_DEFAULT}/api/tasks`, { method: 'GET' });
    if (probe.status === 401 || probe.status === 403 || probe.status === 200) {
      BASE = BASE_DEFAULT;
      console.log(`使用已有后端 ${BASE}\n`);
      return;
    }
  } catch {
    /* start embedded server */
  }

  if (process.env.REGRESSION_NO_EMBED_SERVER === '1') {
    throw new Error(`无法连接 ${BASE_DEFAULT}，且 REGRESSION_NO_EMBED_SERVER=1`);
  }

  process.env.SOCKET_IO_REDIS_DEV_PROBE = process.env.SOCKET_IO_REDIS_DEV_PROBE || '0';
  process.env.REDIS_ENABLED = process.env.REDIS_ENABLED || '0';

  const { listenApp } = require('../createHttpServer');
  const port = Number(process.env.REGRESSION_PORT) || 3099;
  const { server } = await listenApp(port);
  ownedServer = server;
  BASE = `http://127.0.0.1:${port}`;
  console.log(`已启动内嵌 HTTP 服务 ${BASE}（Redis 未启动时 Socket 可能告警，不影响 REST 回归）\n`);
}

async function shutdownHttpServer() {
  if (ownedServer) {
    await new Promise((resolve) => ownedServer.close(resolve));
  }
}

async function findTaskByCreatorUsername(creatorUsername, { teachingClassOnly = false } = {}) {
  const [rows] = await pool.query(
    `
    SELECT t.id, t.title, t.created_by, t.teaching_class_id, t.class_id, u.username AS creator_username
    FROM tasks t
    JOIN users u ON u.id = t.created_by
    WHERE u.username = ?
      ${teachingClassOnly ? 'AND t.teaching_class_id IS NOT NULL' : ''}
    ORDER BY t.id DESC
    LIMIT 1
  `,
    [creatorUsername]
  );
  return rows[0] || null;
}

async function findStudentForTeachingClass(tcId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.role, u.class_id
     FROM teaching_class_students tcs
     JOIN users u ON u.id = tcs.student_id
     WHERE tcs.teaching_class_id = ?
     LIMIT 1`,
    [tcId]
  );
  return rows[0] || null;
}

async function findEnterpriseForTeachingClass(tcId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.role
     FROM enterprise_teaching_class_access ea
     JOIN users u ON u.id = ea.enterprise_user_id
     WHERE ea.teaching_class_id = ?
     LIMIT 1`,
    [tcId]
  );
  return rows[0] || null;
}

async function findSubmissionForTask(taskId) {
  const [rows] = await pool.query(
    'SELECT id, student_id FROM submissions WHERE task_id = ? ORDER BY id DESC LIMIT 1',
    [taskId]
  );
  return rows[0] || null;
}

async function main() {
  console.log(`\n=== 教师权限 HTTP 回归 @ ${BASE_DEFAULT} ===\n`);

  try {
    await ensureHttpServer();
  } catch (e) {
    console.error(e.message);
    console.error('请先启动 backend（npm run dev）并执行 npm run seed:test');
    process.exit(2);
  }

  const teacherA = await getUser('test-teacher-01');
  const teacherB = await getUser('test-teacher-02');
  const admin = await getUser('admin');

  const taskB = await findTaskByCreatorUsername('test-teacher-02', { teachingClassOnly: true });
  if (!taskB) {
    fail('前置数据', '未找到 test-teacher-02 创建的教学班任务');
    process.exit(1);
  }
  const taskBId = Number(taskB.id);
  const tcId = Number(taskB.teaching_class_id);

  const student = (await findStudentForTeachingClass(tcId)) || (await getUser('test-student-03'));
  const enterprise =
    (await findEnterpriseForTeachingClass(tcId)) || (await getUser('test-enterprise-02'));

  for (const [label, u] of [
    ['test-teacher-01', teacherA],
    ['test-teacher-02', teacherB],
    ['admin', admin],
    [`student(${student?.username})`, student],
    [`enterprise(${enterprise?.username})`, enterprise],
  ]) {
    if (!u) fail('种子账号', `缺少 ${label}，请运行 npm run seed:test`);
  }
  if (failed) {
    process.exit(1);
  }

  const tokenA = await makeToken(teacherA);
  const tokenB = await makeToken(teacherB);
  const tokenAdmin = await makeToken(admin);
  const tokenStudent = await makeToken(student);
  const tokenEnterprise = await makeToken(enterprise);

  const submissionB = await findSubmissionForTask(taskBId);
  const submissionId = submissionB ? Number(submissionB.id) : null;

  console.log(
    `样本：task-B id=${taskBId} tc=${tcId} submission=${submissionId || '无'} student=${student.username} enterprise=${enterprise.username}\n`
  );

  const listB = await http('GET', '/api/tasks', { token: tokenB });
  expect(listB.json?.success, 'B GET /api/tasks success', listB.json?.message);
  const bIds = (listB.json?.data || []).map((t) => Number(t.id));
  expect(bIds.includes(taskBId), 'B 任务列表含自建 task-B', `ids=${bIds.join(',')}`);

  const listA = await http('GET', '/api/tasks', { token: tokenA });
  const aIds = (listA.json?.data || []).map((t) => Number(t.id));
  expect(!aIds.includes(taskBId), 'A 任务列表不含 B 的 task-B', `ids=${aIds.join(',')}`);

  const tcListA = await http('GET', `/api/tasks/teaching-class/${tcId}`, { token: tokenA });
  const tcAIds = (tcListA.json?.data || []).map((t) => Number(t.id));
  expect(!tcAIds.includes(taskBId), 'A 教学班任务列表不含 B 的 task-B', `ids=${tcAIds.join(',')}`);

  const tcListB = await http('GET', `/api/tasks/teaching-class/${tcId}`, { token: tokenB });
  const tcBIds = (tcListB.json?.data || []).map((t) => Number(t.id));
  expect(tcBIds.includes(taskBId), 'B 教学班任务列表含自建 task-B', `ids=${tcBIds.join(',')}`);

  const detailA = await http('GET', `/api/tasks/${taskBId}`, { token: tokenA });
  expectStatus('A 查看 B 任务详情 → 403', detailA.status, 403);

  const detailB = await http('GET', `/api/tasks/${taskBId}`, { token: tokenB });
  expectStatus('B 查看自建任务详情 → 200', detailB.status, 200);

  const subsA = await http('GET', `/api/submissions/task/${taskBId}`, { token: tokenA });
  expectStatus('A 查看 B 提交列表 → 403', subsA.status, 403);

  const subsB = await http('GET', `/api/submissions/task/${taskBId}`, { token: tokenB });
  expectStatus('B 查看自建任务提交 → 200', subsB.status, 200);

  const overviewA = await http('GET', `/api/tasks/${taskBId}/submission-overview`, { token: tokenA });
  expectStatus('A 任务提交概览 → 403', overviewA.status, 403);

  if (submissionId) {
    const gradeGetA = await http('GET', `/api/grading/${submissionId}`, { token: tokenA });
    expectStatus('A 查看 B 批改结果 → 403', gradeGetA.status, 403);

    const gradeGetB = await http('GET', `/api/grading/${submissionId}`, { token: tokenB });
    expect(gradeGetB.status === 200 || gradeGetB.status === 404, 'B 查看批改结果 200/404', gradeGetB.status);

    const aiA = await http('POST', `/api/grading/ai/${submissionId}`, { token: tokenA });
    expectStatus('A AI 批改 → 403', aiA.status, 403);

    const humanA = await http('PUT', `/api/grading/human/${submissionId}`, {
      token: tokenA,
      body: { humanScore: 80, humanComment: `${PREFIX}regression-deny` },
    });
    expectStatus('A 人工复核 → 403', humanA.status, 403);

    const verifyA = await http('PATCH', `/api/grading/verification/${submissionId}`, {
      token: tokenA,
      body: { verificationTeacherOverride: {} },
    });
    expectStatus('A 核查修正 → 403', verifyA.status, 403);

    const exportA = await http(
      'GET',
      `/api/export/scores?taskId=${taskBId}&teachingClassId=${tcId}`,
      { token: tokenA }
    );
    expectStatus('A 导出 Excel → 403', exportA.status, 403);

    const zipA = await http(
      'GET',
      `/api/export/submissions-zip?taskId=${taskBId}&teachingClassId=${tcId}`,
      { token: tokenA }
    );
    expectStatus('A 导出 ZIP → 403', zipA.status, 403);

    const pdfA = await http('GET', `/api/reports/personal/${submissionId}/pdf`, { token: tokenA });
    expectStatus('A 导出 PDF → 403', pdfA.status, 403);

    const exportB = await http(
      'GET',
      `/api/export/scores?taskId=${taskBId}&teachingClassId=${tcId}`,
      { token: tokenB }
    );
    expect(exportB.status === 200, 'B 导出 Excel → 200', exportB.status);

    const batchA = await http('POST', `/api/grading/batch/${taskBId}`, { token: tokenA });
    expectStatus('A 批量 AI 批改 → 403', batchA.status, 403);
  } else {
    console.log('  ⚠ 无 submission，跳过提交级批改/导出用例');
  }

  const detailAdmin = await http('GET', `/api/tasks/${taskBId}`, { token: tokenAdmin });
  expectStatus('admin 查看 task-B → 200', detailAdmin.status, 200);

  const listAdmin = await http('GET', '/api/tasks', { token: tokenAdmin });
  const adminIds = (listAdmin.json?.data || []).map((t) => Number(t.id));
  expect(adminIds.includes(taskBId), 'admin 任务列表含 task-B', `count=${adminIds.length}`);

  const listStudent = await http('GET', '/api/tasks', { token: tokenStudent });
  expect(listStudent.json?.success, 'student GET /api/tasks success', listStudent.json?.message);
  const stIds = (listStudent.json?.data || []).map((t) => Number(t.id));
  expect(stIds.includes(taskBId), 'student 可见已加入教学班 task-B', `ids=${stIds.join(',')}`);

  const detailStudent = await http('GET', `/api/tasks/${taskBId}`, { token: tokenStudent });
  expectStatus('student 查看 task-B 详情 → 200', detailStudent.status, 200);

  if (submissionId) {
    const aiStudent = await http('POST', `/api/grading/ai/${submissionId}`, { token: tokenStudent });
    expectStatus('student AI 批改 → 403', aiStudent.status, 403);

    const gradeEnt = await http('GET', `/api/grading/${submissionId}`, { token: tokenEnterprise });
    expect(gradeEnt.status === 200 || gradeEnt.status === 404, 'enterprise 查看授权提交 200/404', gradeEnt.status);

    const aiEnt = await http('POST', `/api/grading/ai/${submissionId}`, { token: tokenEnterprise });
    expectStatus('enterprise AI 批改 → 403', aiEnt.status, 403);
  }

  const [legacyTask] = await pool.query(
    `SELECT t.id, t.class_id FROM tasks t
     JOIN users u ON u.id = t.created_by
     WHERE u.username = 'teacher1' AND t.teaching_class_id IS NULL AND t.class_id IS NOT NULL
     LIMIT 1`
  );
  if (legacyTask.length) {
    const legacyClassId = Number(legacyTask[0].class_id);
    let legacyStudent = student;
    if (!legacyStudent?.class_id || Number(legacyStudent.class_id) !== legacyClassId) {
      const [rows] = await pool.query(
        `SELECT id, username, role, class_id FROM users WHERE class_id = ? AND role = 'student' LIMIT 1`,
        [legacyClassId]
      );
      legacyStudent = rows[0] || null;
    }
    if (legacyStudent) {
      const legacyToken = await makeToken(legacyStudent);
      const legacyRes = await http('GET', `/api/tasks/class/${legacyClassId}`, {
        token: legacyToken,
      });
      const legacyIds = (legacyRes.json?.data || []).map((t) => Number(t.id));
      expect(
        !legacyIds.includes(taskBId),
        'legacy GET /tasks/class 不含教学班 task-B',
        `legacyIds=${legacyIds.join(',')}`
      );
      expect(
        legacyIds.includes(Number(legacyTask[0].id)),
        'legacy GET /tasks/class 含行政班 legacy 任务',
        `legacyIds=${legacyIds.join(',')}`
      );
    } else {
      console.log('  ⚠ 无行政班学生，跳过 legacy /tasks/class 正向用例');
    }
  }

  console.log(`\n=== 结果：${passed} 通过，${failed} 失败 ===`);
  if (failures.length) {
    console.log('\n失败项：');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await shutdownHttpServer();
    await pool.end();
  });
