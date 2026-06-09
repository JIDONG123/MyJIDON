#!/usr/bin/env node
/**
 * 知识图谱 API smoke：三端权限 + 节点/关系中文规范化
 *   cd backend && node scripts/kg-api-smoke-test.js
 */
require('../config/loadEnv').loadEnv();

const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const kgQuery = require('../services/kgQueryService');
const {
  normalizeNode,
  normalizeLink,
  loadNodeMetaMap,
  relationLabel,
  typeLabel,
} = require('../utils/kgNodeNormalize');
const { teacherCanViewStudent, teacherCanAccessKgScope } = require('../utils/accessControl');

const ENGLISH_TYPE_PATTERN = /^(knowledge_point|mistake_point|administrative_class|CONTAINS|RELATES_TO|task|student|class)$/;
const PLACEHOLDER_CLASS = /^班级\d+$/;

let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed += 1;
  console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`);
}

function makeToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function getUser(username) {
  const [rows] = await pool.query(
    'SELECT id, username, role, real_name, class_id FROM users WHERE username=? LIMIT 1',
    [username]
  );
  return rows[0] || null;
}

function assertNodeNormalized(node, ctx) {
  const errors = [];
  if (!node.displayName) errors.push('missing displayName');
  if (!node.typeLabel) errors.push('missing typeLabel');
  if (ENGLISH_TYPE_PATTERN.test(String(node.typeLabel))) errors.push(`typeLabel english: ${node.typeLabel}`);
  if (PLACEHOLDER_CLASS.test(String(node.displayName))) errors.push(`placeholder class name: ${node.displayName}`);
  if (/^[a-z_]+$/.test(String(node.typeLabel)) && node.typeLabel !== '未知节点') {
    errors.push(`raw typeLabel: ${node.typeLabel}`);
  }
  if (errors.length) fail(`${ctx} node ${node.id}`, errors.join('; '));
  else ok(`${ctx} node normalized (${node.typeLabel})`);
}

function assertGraphShape(graph, ctx) {
  if (!graph?.nodes?.length) {
    fail(`${ctx} graph has nodes`, 'empty');
    return;
  }
  ok(`${ctx} graph nodes=${graph.nodes.length} links=${graph.links?.length || 0}`);
  for (const n of graph.nodes.slice(0, 5)) assertNodeNormalized(n, ctx);
  for (const l of (graph.links || []).slice(0, 5)) {
    if (!l.relationLabel) fail(`${ctx} link relationLabel`, l.value);
    else if (ENGLISH_TYPE_PATTERN.test(l.relationLabel)) fail(`${ctx} link english label`, l.relationLabel);
    else ok(`${ctx} link ${l.relationLabel}`);
  }
  const legendTypes = new Set(graph.nodes.map((n) => n.type));
  const expected = ['course', 'chapter', 'administrative_class', 'teaching_class', 'task', 'knowledge_point', 'student', 'weakness', 'error', 'exercise'];
  const hasKnown = [...legendTypes].some((t) => expected.includes(t));
  if (hasKnown) ok(`${ctx} canonical node types present`);
}

async function testNormalizeUnit() {
  console.log('\n[unit] normalize labels');
  const metaMap = await loadNodeMetaMap([
    { id: 'class_1', type: 'class', source_id: '1', name: '班级1' },
  ]);
  const node = normalizeNode(
    { id: 'class_1', type: 'class', name: '班级1', source_id: '1' },
    metaMap,
    'admin'
  );
  if (node.type === 'administrative_class') ok('class → administrative_class');
  else fail('class → administrative_class', node.type);
  if (node.typeLabel === '行政班') ok('typeLabel 行政班');
  else fail('typeLabel 行政班', node.typeLabel);
  if (!PLACEHOLDER_CLASS.test(node.displayName)) ok('displayName not 班级N placeholder');
  else fail('displayName placeholder', node.displayName);

  const ex = normalizeNode({ id: 'exercise_1', type: 'exercise', name: '习题A' }, metaMap, 'admin');
  if (ex.type === 'exercise' && ex.typeLabel === '习题') ok('exercise independent type');
  else fail('exercise type', `${ex.type}/${ex.typeLabel}`);

  const link = normalizeLink({ from: 'a', to: 'b', type: 'CONTAINS' });
  if (link.relationLabel === '包含') ok('CONTAINS → 包含');
  else fail('CONTAINS label', link.relationLabel);
  if (relationLabel('RELATES_TO') === '相关') ok('RELATES_TO → 相关');
  else fail('RELATES_TO label');
  if (typeLabel('unknown_xyz') === '未知节点') ok('unknown type → 未知节点');
  else fail('unknown typeLabel', typeLabel('unknown_xyz'));
}

async function findTeacherWithClass() {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, c.id AS class_id
     FROM users u
     JOIN classes c ON c.teacher_id = u.id
     WHERE u.role='teacher'
     LIMIT 1`
  );
  return rows[0];
}

async function findOtherTeacherClass(excludeTeacherId) {
  const [rows] = await pool.query(
    `SELECT c.id, c.teacher_id FROM classes c WHERE c.teacher_id IS NOT NULL AND c.teacher_id != ? LIMIT 1`,
    [excludeTeacherId]
  );
  return rows[0];
}

async function testAdminGraph() {
  console.log('\n[admin] course graph');
  const data = await kgQuery.getCourseGraph({});
  assertGraphShape(data.graph, 'admin');
  const types = new Set(data.graph.nodes.map((n) => n.type));
  if (types.has('administrative_class') || types.has('course') || types.has('task')) {
    ok('admin graph has course/class/task family');
  }
}

async function findTeacherWithTeachingClass() {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, tc.id AS teaching_class_id, tc.class_name
     FROM users u
     JOIN teaching_class_teachers tct ON tct.teacher_id = u.id
     JOIN teaching_classes tc ON tc.id = tct.teaching_class_id
     WHERE u.role='teacher'
     LIMIT 1`
  );
  return rows[0];
}

async function findTeacherTeachingClassOnly() {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, tc.id AS teaching_class_id, tc.class_name
     FROM users u
     JOIN teaching_class_teachers tct ON tct.teacher_id = u.id
     JOIN teaching_classes tc ON tc.id = tct.teaching_class_id
     LEFT JOIN classes c ON c.teacher_id = u.id
     WHERE u.role='teacher' AND c.id IS NULL
     LIMIT 1`
  );
  return rows[0];
}

async function testTeacherScopes() {
  console.log('\n[teacher] kg scopes');
  const tcTeacher = await findTeacherWithTeachingClass();
  if (!tcTeacher) {
    console.log('  (skip: no teaching class teacher)');
    return;
  }
  const scopes = await kgQuery.getTeacherKgScopes(tcTeacher.id);
  if (scopes.scopes?.length) ok('getTeacherKgScopes returns scopes');
  else fail('getTeacherKgScopes empty', JSON.stringify(scopes));
  const hasTc = scopes.scopes.some((s) => s.scopeType === 'teaching_class');
  if (hasTc) ok('scopes include teaching_class');
  else fail('scopes missing teaching_class');

  const tcOnly = await findTeacherTeachingClassOnly();
  if (tcOnly) {
    const onlyScopes = await kgQuery.getTeacherKgScopes(tcOnly.id);
    if (onlyScopes.scopes.length > 0 && !onlyScopes.administrativeClasses.length) {
      ok('teaching-only teacher has teaching scopes without admin class');
    } else if (onlyScopes.scopes.length > 0) {
      ok('teaching-only teacher has scopes');
    }
  }
}

async function testTeacherGraph(teacherRow) {
  console.log('\n[teacher] administrative class graph');
  if (!teacherRow) {
    console.log('  (skip: no teacher with admin class)');
  } else {
    const data = await kgQuery.getTeacherGraph({
      scopeType: 'administrative_class',
      scopeId: teacherRow.class_id,
    });
    assertGraphShape(data.graph, 'teacher-admin');
    const other = await findOtherTeacherClass(teacherRow.id);
    if (other) {
      const can = await teacherCanAccessKgScope(teacherRow.id, 'administrative_class', other.id);
      if (!can) ok('teacherCanAccessKgScope denies other admin class');
      else fail('teacherCanAccessKgScope other admin class', 'allowed');
      const canSt = await teacherCanViewStudent(
        teacherRow.id,
        (
          await pool.query(`SELECT id FROM users WHERE class_id=? AND role='student' LIMIT 1`, [
            other.id,
          ])
        )[0][0]?.id
      );
      if (!canSt) ok('teacherCanViewStudent denies other class student');
      else fail('teacherCanViewStudent other class', 'allowed');
    }
  }

  console.log('\n[teacher] teaching class graph');
  const tcTeacher = await findTeacherWithTeachingClass();
  if (!tcTeacher) {
    console.log('  (skip: no teaching class teacher)');
    return;
  }
  const tcData = await kgQuery.getTeacherGraph({
    scopeType: 'teaching_class',
    scopeId: tcTeacher.teaching_class_id,
  });
  assertGraphShape(tcData.graph, 'teacher-tc');
  const canTc = await teacherCanAccessKgScope(
    tcTeacher.id,
    'teaching_class',
    tcTeacher.teaching_class_id
  );
  if (canTc) ok('teacherCanAccessKgScope allows own teaching class');
  else fail('teacherCanAccessKgScope own teaching class');

  const [otherTc] = await pool.query(
    `SELECT tc.id FROM teaching_classes tc
     WHERE tc.id NOT IN (
       SELECT teaching_class_id FROM teaching_class_teachers WHERE teacher_id = ?
     ) LIMIT 1`,
    [tcTeacher.id]
  );
  if (otherTc[0]) {
    const denied = await teacherCanAccessKgScope(tcTeacher.id, 'teaching_class', otherTc[0].id);
    if (!denied) ok('teacherCanAccessKgScope denies other teaching class');
    else fail('teacherCanAccessKgScope other teaching class', 'allowed');
  }

  const [tcStudent] = await pool.query(
    `SELECT student_id FROM teaching_class_students WHERE teaching_class_id = ? LIMIT 1`,
    [tcTeacher.teaching_class_id]
  );
  if (tcStudent[0]) {
    const canSt = await teacherCanViewStudent(tcTeacher.id, tcStudent[0].student_id);
    if (canSt) ok('teacherCanViewStudent allows teaching class student');
    else fail('teacherCanViewStudent teaching class student');
  }

  await testTeachingClassZeroTasksGraph();
}

async function testTeachingClassZeroTasksGraph() {
  console.log('\n[teacher] zero-task teaching class graph');
  const [rows] = await pool.query(
    `SELECT tc.id FROM teaching_classes tc
     LEFT JOIN tasks t ON t.teaching_class_id = tc.id
     WHERE t.id IS NULL
     LIMIT 1`
  );
  if (!rows[0]) {
    console.log('  (skip: no teaching class without tasks)');
    return;
  }
  const data = await kgQuery.getTeachingClassGraph(rows[0].id);
  const mistakes = data.graph.nodes.filter(
    (n) => n.type === 'weakness' || n.type === 'error' || n.rawType === 'mistake_point'
  );
  if (!mistakes.length) ok('zero-task teaching class has no weak/error nodes');
  else fail('zero-task teaching class has mistake nodes', String(mistakes.length));
  if (data.stats.taskCount === 0) ok('zero-task teaching class stats.taskCount is 0');
  else fail('zero-task teaching class stats.taskCount', data.stats.taskCount);
}

async function testStudentGraph(student) {
  console.log('\n[student] personal graph');
  if (!student) {
    console.log('  (skip: no student user)');
    return;
  }
  const data = await kgQuery.getStudentGraph(student.id);
  assertGraphShape(data.graph, 'student');
  const otherStudents = data.graph.nodes.filter((n) => n.type === 'student' && n.id !== `student_${student.id}`);
  if (!otherStudents.length) ok('student graph has no other student nodes');
  else fail('other students in graph', otherStudents.map((n) => n.displayName).join(', '));
  const sid = `student_${student.id}`;
  if (data.graph.nodes.some((n) => n.id === sid)) ok('self node present');
}

async function testHttpAcl() {
  console.log('\n[http] controller ACL (optional)');
  const admin = await getUser('admin');
  const teacher = await findTeacherWithClass();
  const student = await getUser('student') || (await pool.query(`SELECT id, username, role, class_id FROM users WHERE role='student' LIMIT 1`))[0][0];
  if (!admin || !process.env.JWT_SECRET) {
    console.log('  (skip HTTP: missing admin or JWT_SECRET)');
    return;
  }
  const BASE = `http://127.0.0.1:${process.env.PORT || 3000}`;
  const adminToken = makeToken(admin);
  const headers = (token) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });
  try {
    const resAdmin = await fetch(`${BASE}/api/kg/course`, { headers: headers(adminToken) });
    if (resAdmin.status === 200) ok('HTTP admin GET /kg/course 200');
    else fail('HTTP admin course', resAdmin.status);

    if (student) {
      const stToken = makeToken(student);
      const resStDeny = await fetch(`${BASE}/api/kg/course`, { headers: headers(stToken) });
      if (resStDeny.status === 403) ok('HTTP student denied full course graph');
      else fail('HTTP student course ACL', resStDeny.status);

      const [other] = await pool.query(
        `SELECT id FROM users WHERE role='student' AND id != ? LIMIT 1`,
        [student.id]
      );
      if (other[0]) {
        const resOther = await fetch(`${BASE}/api/kg/student/${other[0].id}`, { headers: headers(stToken) });
        if (resOther.status === 403) ok('HTTP student denied other student graph');
        else fail('HTTP student other graph', resOther.status);
      }
    }

    if (teacher) {
      const tToken = makeToken({ id: teacher.id, username: teacher.username, role: 'teacher' });
      const resClass = await fetch(`${BASE}/api/kg/class/${teacher.class_id}`, { headers: headers(tToken) });
      if (resClass.status === 200) ok('HTTP teacher own admin class 200');
      else fail('HTTP teacher admin class', resClass.status);
      const other = await findOtherTeacherClass(teacher.id);
      if (other) {
        const resOther = await fetch(`${BASE}/api/kg/class/${other.id}`, { headers: headers(tToken) });
        if (resOther.status === 403) ok('HTTP teacher denied other admin class');
        else fail('HTTP teacher other admin class', resOther.status);
      }
      const tcTeacher = await findTeacherWithTeachingClass();
      if (tcTeacher) {
        const tcToken = makeToken({ id: tcTeacher.id, username: tcTeacher.username, role: 'teacher' });
        const resScopes = await fetch(`${BASE}/api/kg/teacher-scopes`, { headers: headers(tcToken) });
        if (resScopes.status === 200) ok('HTTP teacher GET /kg/teacher-scopes 200');
        else fail('HTTP teacher scopes', resScopes.status);
        const resTc = await fetch(
          `${BASE}/api/kg/teacher-graph?scopeType=teaching_class&scopeId=${tcTeacher.teaching_class_id}`,
          { headers: headers(tcToken) }
        );
        if (resTc.status === 200) ok('HTTP teacher own teaching class graph 200');
        else fail('HTTP teacher teaching class graph', resTc.status);
      }
    }
  } catch (e) {
    console.log(`  (skip HTTP: server not running — ${e.message})`);
  }
}

async function main() {
  console.log('KG API smoke test');
  await testNormalizeUnit();
  await testAdminGraph();
  const teacherRow = await findTeacherWithClass();
  await testTeacherScopes();
  await testTeacherGraph(teacherRow);
  const student =
    (await getUser('student')) ||
    (await pool.query(`SELECT id, username, role, class_id FROM users WHERE role='student' LIMIT 1`))[0][0];
  await testStudentGraph(student);
  await testHttpAcl();
  console.log(`\nDone: ${passed} passed, ${failed} failed`);
  try {
    await pool.end?.();
  } catch {
    /* ignore pool close race on Windows */
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
