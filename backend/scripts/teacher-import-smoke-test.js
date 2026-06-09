#!/usr/bin/env node
require('../config/loadEnv').loadEnv();

const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { buildImportTemplateBuffer } = require('../utils/teacherImportExcel');
const teacherImportService = require('../services/teacherImportService');
const { verifyPassword } = require('../utils/passwordPolicy');

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

function buildTestWorkbook(rows) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('教师账号导入');
  sheet.addRow(['用户名 *', '真实姓名 *', '工号 *', '邮箱 *', '学院 / 部门 *', '电话号码']);
  for (const r of rows) sheet.addRow(r);
  return wb.xlsx.writeBuffer();
}

(async () => {
  const { printModeBanner, requireMutation } = require('./lib/scriptSafety');
  printModeBanner('teacher-import-smoke');
  if (!requireMutation('teacher-import-smoke')) {
    console.log('用法：SCRIPT_ALLOW_MUTATION=1 npm run smoke:teacher-import');
    process.exit(0);
  }

  console.log('[teacher-import-smoke] start');

  try {
    await assertColumn('users', 'teacher_no');
    await assertColumn('users', 'must_change_password');
    await assertColumn('teacher_import_batches', 'batch_no');
    await assertColumn('teacher_import_rows', 'batch_id');
    ok('schema verified');
  } catch (e) {
    fail('schema', e);
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

  const uname = `smoke_tea_${stamp}`;
  const tno = `T${stamp}`;
  const email = `smoke_tea_${stamp}@example.com`;

  try {
    const buf = await buildTestWorkbook([['', '李老师', tno, email, '计算机学院', '']]);
    const preview = await teacherImportService.previewImport({
      buffer: Buffer.from(await buf),
      originalName: 'bad.xlsx',
      uploadedBy: adminId,
      savedPath: null,
    });
    if (preview.errorRows < 1) throw new Error('expected error row for missing username');
    ok('missing username blocked');
  } catch (e) {
    fail('missing username', e);
  }

  try {
    const buf = await buildTestWorkbook([[uname, '李老师', tno, email, '', '']]);
    const preview = await teacherImportService.previewImport({
      buffer: Buffer.from(await buf),
      originalName: 'bad-dept.xlsx',
      uploadedBy: adminId,
      savedPath: null,
    });
    if (preview.errorRows < 1) throw new Error('expected error for missing department');
    ok('missing department blocked');
  } catch (e) {
    fail('missing department', e);
  }

  let batchId;
  try {
    const buf = await buildTestWorkbook([[uname, '李老师', tno, email, '计算机学院', '13800000002']]);
    const preview = await teacherImportService.previewImport({
      buffer: Buffer.from(await buf),
      originalName: `ok_${stamp}.xlsx`,
      uploadedBy: adminId,
      savedPath: null,
    });
    if (preview.errorRows !== 0) throw new Error(JSON.stringify(preview.rows));
    batchId = preview.batchId;
    ok('valid preview');
  } catch (e) {
    fail('valid preview', e);
  }

  if (batchId) {
    try {
      const result = await teacherImportService.confirmImport(batchId, adminId);
      if (result.importedRows !== 1) throw new Error(`imported=${result.importedRows}`);
      ok('confirm import success');

      const [users] = await pool.query('SELECT * FROM users WHERE username=? LIMIT 1', [uname]);
      if (!users[0]) throw new Error('user not created');
      if (Number(users[0].must_change_password) !== 1) throw new Error('must_change_password should be 1');
      const pwdOk = await verifyPassword(tno, users[0].password);
      if (!pwdOk) throw new Error('password should be bcrypt hash of teacher_no');
      ok('imported user fields correct');

      try {
        await teacherImportService.confirmImport(batchId, adminId);
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
    await pool.query('DELETE FROM users WHERE username=?', [uname]);
    if (batchId) await pool.query('DELETE FROM teacher_import_batches WHERE id=?', [batchId]);
    ok('cleanup');
  } catch (e) {
    fail('cleanup', e);
  }

  console.log(`\n[teacher-import-smoke] done: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
