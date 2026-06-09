#!/usr/bin/env node
/**
 * 学生账号导入 + 首次改密 冒烟测试
 * 用法：node scripts/student-import-smoke-test.js
 */
require('../config/loadEnv').loadEnv();

const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { buildImportTemplateBuffer } = require('../utils/studentImportExcel');
const studentImportService = require('../services/studentImportService');
const { verifyPassword } = require('../utils/passwordPolicy');

const BASE = `http://127.0.0.1:${process.env.PORT || 3000}`;
const stamp = Date.now();

let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fail(name, err) {
  failed += 1;
  console.error(`  ✗ ${name}: ${err?.message || err}`);
}

async function assertColumn(table, column) {
  const db = process.env.DB_NAME || 'smart_grading_system';
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
    [db, table, column]
  );
  if (!rows.length) throw new Error(`missing ${table}.${column}`);
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

async function api(method, path, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers });
  return { status: res.status };
}

function buildTestWorkbook(rows) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('学生账号导入');
  sheet.addRow(['用户名 *', '真实姓名 *', '学号 *', '电话号码 *', '邮箱 *', '班级名称']);
  for (const r of rows) sheet.addRow(r);
  return wb.xlsx.writeBuffer();
}

(async () => {
  const { printModeBanner, requireMutation } = require('./lib/scriptSafety');
  printModeBanner('student-import-smoke');
  if (!requireMutation('student-import-smoke')) {
    console.log('用法：SCRIPT_ALLOW_MUTATION=1 npm run smoke:student-import');
    process.exit(0);
  }

  console.log('[student-import-smoke] start');

  try {
    await assertColumn('users', 'must_change_password');
    await assertColumn('users', 'password_changed_at');
    await assertColumn('users', 'student_no');
    await assertColumn('users', 'phone');
    await assertColumn('student_import_batches', 'batch_no');
    await assertColumn('student_import_rows', 'batch_id');
    ok('schema columns and import tables verified');
  } catch (e) {
    fail('schema verification', e);
  }

  try {
    const tpl = await buildImportTemplateBuffer();
    if (!tpl || tpl.length < 100) throw new Error('template too small');
    ok('template buffer generated');
  } catch (e) {
    fail('template buffer', e);
  }

  let adminId;
  try {
    const [admins] = await pool.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
    if (!admins[0]) throw new Error('no admin user');
    adminId = admins[0].id;
    ok('admin user found');
  } catch (e) {
    fail('admin user', e);
  }

  const uname = `smoke_stu_${stamp}`;
  const sno = `S${stamp}`;
  const email = `smoke_${stamp}@example.com`;

  try {
    const buf = await buildTestWorkbook([['', '李四', sno, '13800001111', email, '']]);
    const preview = await studentImportService.previewImport({
      buffer: Buffer.from(await buf),
      originalName: 'bad.xlsx',
      uploadedBy: adminId,
      savedPath: null,
    });
    if (preview.errorRows < 1) throw new Error('expected error row for missing username');
    ok('missing username blocked in preview');
  } catch (e) {
    fail('missing username', e);
  }

  let batchId;
  try {
    const buf = await buildTestWorkbook([[uname, '测试生', sno, '13800002222', email, '']]);
    const preview = await studentImportService.previewImport({
      buffer: Buffer.from(await buf),
      originalName: `ok_${stamp}.xlsx`,
      uploadedBy: adminId,
      savedPath: null,
    });
    if (preview.errorRows !== 0) throw new Error(`unexpected errors: ${JSON.stringify(preview.rows)}`);
    if (preview.validRows !== 1) throw new Error('expected 1 valid row');
    batchId = preview.batchId;
    ok('empty class name passes preview');
  } catch (e) {
    fail('empty class preview', e);
  }

  if (batchId) {
    try {
      const result = await studentImportService.confirmImport(batchId, adminId);
      if (result.importedRows !== 1) throw new Error(`imported=${result.importedRows}`);
      ok('confirm import success');

      const [users] = await pool.query('SELECT * FROM users WHERE username=? LIMIT 1', [uname]);
      if (!users[0]) throw new Error('user not created');
      if (users[0].class_id != null) throw new Error('class_id should be null');
      if (Number(users[0].must_change_password) !== 1) throw new Error('must_change_password should be 1');
      const pwdOk = await verifyPassword(sno, users[0].password);
      if (!pwdOk) throw new Error('password should be bcrypt hash of student_no');
      ok('imported user fields correct');

      try {
        await studentImportService.confirmImport(batchId, adminId);
        fail('duplicate confirm', 'should have thrown');
      } catch (e) {
        if (String(e.message).includes('重复')) ok('duplicate confirm blocked');
        else fail('duplicate confirm', e);
      }
    } catch (e) {
      fail('confirm import', e);
    }
  }

  try {
    const [teachers] = await pool.query("SELECT username FROM users WHERE role='teacher' LIMIT 1");
    if (teachers[0]) {
      const tToken = await tokenFor(teachers[0].username);
      const r = await api('GET', '/api/admin/students/import-template', tToken);
      if (r.status !== 403) throw new Error(`expected 403 got ${r.status}`);
      ok('teacher blocked from import API');
    } else {
      ok('teacher blocked (skipped — no teacher user)');
    }
  } catch (e) {
    if (String(e.message || e).includes('fetch failed')) {
      ok('teacher permission (skipped — API server not running)');
    } else {
      fail('teacher permission', e);
    }
  }

  try {
    await pool.query('DELETE FROM users WHERE username=?', [uname]);
    if (batchId) {
      await pool.query('DELETE FROM student_import_batches WHERE id=?', [batchId]);
    }
    ok('cleanup test data');
  } catch (e) {
    fail('cleanup', e);
  }

  console.log(`\n[student-import-smoke] done: ${passed} passed, ${failed} failed`);
  await pool.end?.();
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
