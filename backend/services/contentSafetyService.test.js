const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.CONTENT_SAFETY_ENABLED = '1';

const {
  validateFileBasic,
  detectTextSafety,
  validateAccountFields,
  validateExcelImport,
  assertSubmissionSafeForAiGrading,
  isEnabled,
} = require('../services/contentSafetyService');

describe('contentSafetyService', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-test-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('isEnabled respects env', () => {
    assert.equal(isEnabled(), true);
  });

  it('validateFileBasic rejects path traversal filename', () => {
    const r = validateFileBasic(
      { originalname: '../evil.pdf', size: 100, path: null, buffer: Buffer.from('%PDF') },
      { profile: 'submission' }
    );
    assert.equal(r.passed, false);
    assert.match(r.reason, /非法路径/);
  });

  it('validateFileBasic rejects unsupported type for avatar', () => {
    const r = validateFileBasic(
      { originalname: 'a.gif', size: 100, buffer: Buffer.from('GIF89a') },
      { profile: 'avatar' }
    );
    assert.equal(r.passed, false);
  });

  it('detectTextSafety blocks formula injection in account context', async () => {
    const r = await detectTextSafety('=cmd|"/c calc"', { type: 'account_field' });
    assert.equal(r.riskLevel, 'blocked');
  });

  it('detectTextSafety allows code context keywords', async () => {
    const r = await detectTextSafety('shell.exec("delete attack")', { type: 'code', isCode: true });
    assert.notEqual(r.riskLevel, 'blocked');
  });

  it('validateAccountFields rejects bad username', async () => {
    const r = await validateAccountFields(
      { username: 'ab', realName: '张三', studentNo: '2026001', phone: '13800138000', email: 'a@b.com' },
      'student'
    );
    assert.equal(r.passed, false);
  });

  it('validateAccountFields accepts valid student fields', async () => {
    const r = await validateAccountFields(
      {
        username: 'student2026001',
        realName: '张三',
        studentNo: '2026001',
        phone: '13800138000',
        email: 'zhangsan@example.com',
      },
      'student'
    );
    assert.equal(r.passed, true);
  });

  it('validateExcelImport rejects formula injection row', async () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const data = [
      ['用户名 *', '真实姓名 *', '学号 *', '电话号码 *', '邮箱 *', '班级名称'],
      ['=HYPERLINK("http://evil")', '李四', '2026002', '13800138001', 'lisi@example.com', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, '学生账号导入');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const r = await validateExcelImport(buf, 'student');
    assert.equal(r.passed, false);
    assert.ok(r.errors.length > 0);
  });

  it('assertSubmissionSafeForAiGrading throws for pending_review', async () => {
    const pool = require('../config/database');
    const [rows] = await pool.query(
      "SELECT id FROM submissions WHERE safety_status = 'pending_review' LIMIT 1"
    );
    if (!rows.length) return;
    await assert.rejects(() => assertSubmissionSafeForAiGrading(rows[0].id), /待复核/);
  });
});
