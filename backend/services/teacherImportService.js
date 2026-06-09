const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const {
  buildImportTemplateBuffer,
  parseImportWorkbook,
  validateEmail,
  validatePhone,
} = require('../utils/teacherImportExcel');
const { hashInitialTeacherPassword, validateInitialTeacherPassword } = require('../utils/passwordPolicy');
const { validateExcelImport } = require('./contentSafetyService');
const ExcelJS = require('exceljs');

const MAX_ROWS = 500;
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'teacher-imports');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function generateBatchNo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TIMP${ts}${rnd}`;
}

function fileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function loadExistingUserKeys() {
  const [rows] = await pool.query(
    `SELECT username, teacher_no, email FROM users WHERE role = 'teacher' OR username IS NOT NULL`
  );
  const usernames = new Set();
  const teacherNos = new Set();
  const emails = new Set();
  for (const r of rows) {
    if (r.username) usernames.add(String(r.username).trim().toLowerCase());
    if (r.teacher_no) teacherNos.add(String(r.teacher_no).trim());
    if (r.email) emails.add(String(r.email).trim().toLowerCase());
  }
  return { usernames, teacherNos, emails };
}

function validateRow(row, ctx) {
  const errors = [];
  const username = row.username?.trim();
  const realName = row.realName?.trim();
  const teacherNo = row.teacherNo?.trim();
  const phone = row.phone?.trim();
  const email = row.email?.trim().toLowerCase();
  const department = row.department?.trim();

  if (!username) errors.push('用户名不能为空');
  if (!realName) errors.push('真实姓名不能为空');
  if (!teacherNo) errors.push('工号不能为空');
  if (!email) errors.push('邮箱不能为空');
  if (!department) errors.push('学院 / 部门不能为空');

  if (username) {
    const ul = username.toLowerCase();
    if (ctx.seenUsernames.has(ul)) errors.push('Excel 内用户名重复');
    else ctx.seenUsernames.add(ul);
    if (ctx.existingUsernames.has(ul)) errors.push('用户名已被占用');
  }

  if (teacherNo) {
    if (ctx.seenTeacherNos.has(teacherNo)) errors.push('Excel 内工号重复');
    else ctx.seenTeacherNos.add(teacherNo);
    if (ctx.existingTeacherNos.has(teacherNo)) errors.push('工号已被占用');
    const pv = validateInitialTeacherPassword(teacherNo);
    if (!pv.ok) errors.push(pv.message);
  }

  if (email) {
    if (!validateEmail(email)) errors.push('邮箱格式不正确');
    if (ctx.seenEmails.has(email)) errors.push('Excel 内邮箱重复');
    else ctx.seenEmails.add(email);
    if (ctx.existingEmails.has(email)) errors.push('邮箱已被占用');
  }

  if (phone && !validatePhone(phone)) errors.push('电话号码格式不正确');

  return {
    username,
    realName,
    teacherNo,
    phone: phone || null,
    email,
    department,
    errors,
    valid: errors.length === 0,
  };
}

async function previewImport({ buffer, originalName, uploadedBy, savedPath }) {
  if (!buffer || !buffer.length) {
    throw new Error('文件为空');
  }
  const parsed = parseImportWorkbook(buffer);
  if (parsed.length > MAX_ROWS) {
    throw new Error(`单次导入最多 ${MAX_ROWS} 行`);
  }
  if (!parsed.length) {
    throw new Error('未检测到有效数据行');
  }

  const existing = await loadExistingUserKeys();
  const ctx = {
    existingUsernames: existing.usernames,
    existingTeacherNos: existing.teacherNos,
    existingEmails: existing.emails,
    seenUsernames: new Set(),
    seenTeacherNos: new Set(),
    seenEmails: new Set(),
  };

  const validated = parsed.map((row) => ({
    rowNumber: row.rowNumber,
    ...validateRow(row, ctx),
  }));

  const safety = await validateExcelImport(buffer, 'teacher');
  if (safety.errors?.length) {
    const byRow = new Map();
    for (const err of safety.errors) {
      const key = err.row;
      if (!byRow.has(key)) byRow.set(key, []);
      byRow.get(key).push(`第 ${err.row} 行【${err.field}】${err.message}`);
    }
    for (const row of validated) {
      const extra = byRow.get(row.rowNumber) || [];
      if (extra.length) {
        row.errors.push(...extra);
        row.valid = false;
      }
    }
  }

  const validRows = validated.filter((r) => r.valid).length;
  const errorRows = validated.length - validRows;
  const batchNo = generateBatchNo();
  const hash = fileHash(buffer);
  const now = new Date();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [batchResult] = await conn.query(
      `INSERT INTO teacher_import_batches
        (batch_no, file_name, file_path, file_hash, uploaded_by, total_rows, valid_rows, error_rows,
         status, default_password_policy, previewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'previewed', 'teacher_no', ?)`,
      [batchNo, originalName, savedPath || null, hash, uploadedBy, validated.length, validRows, errorRows, now]
    );
    const batchId = batchResult.insertId;

    for (const row of validated) {
      await conn.query(
        `INSERT INTO teacher_import_rows
          (batch_id, \`row_number\`, username, real_name, teacher_no, phone, email, department,
           password_policy, valid, status, errors_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'teacher_no', ?, ?, ?)`,
        [
          batchId,
          row.rowNumber,
          row.username,
          row.realName,
          row.teacherNo,
          row.phone,
          row.email,
          row.department,
          row.valid ? 1 : 0,
          row.valid ? 'valid' : 'error',
          JSON.stringify(row.errors),
        ]
      );
    }
    await conn.commit();

    return {
      batchId,
      batchNo,
      totalRows: validated.length,
      validRows,
      errorRows,
      rows: validated.map((r) => ({
        rowNumber: r.rowNumber,
        username: r.username,
        realName: r.realName,
        teacherNo: r.teacherNo,
        phone: r.phone,
        email: r.email,
        department: r.department,
        valid: r.valid,
        status: r.valid ? 'valid' : 'error',
        errors: r.errors,
      })),
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function getBatchById(batchId) {
  const [rows] = await pool.query('SELECT * FROM teacher_import_batches WHERE id = ? LIMIT 1', [batchId]);
  return rows[0] || null;
}

async function confirmImport(batchId, adminId) {
  const batch = await getBatchById(batchId);
  if (!batch) {
    const err = new Error('导入批次不存在');
    err.status = 404;
    throw err;
  }
  if (batch.status !== 'previewed') {
    const err = new Error('该批次已处理，不能重复导入');
    err.status = 400;
    throw err;
  }
  if (Number(batch.error_rows) > 0) {
    const err = new Error('存在预检错误行，请修正 Excel 后重新上传');
    err.status = 400;
    throw err;
  }

  await pool.query(
    `UPDATE teacher_import_batches SET status = 'importing', confirmed_at = NOW() WHERE id = ? AND status = 'previewed'`,
    [batchId]
  );

  const [rowRows] = await pool.query(
    `SELECT * FROM teacher_import_rows WHERE batch_id = ? AND valid = 1 AND status = 'valid' ORDER BY \`row_number\``,
    [batchId]
  );

  let importedRows = 0;
  let failedRows = 0;

  for (const row of rowRows) {
    try {
      const [dupU] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', [row.username]);
      if (dupU.length) throw new Error('用户名已被占用');
      const [dupT] = await pool.query(
        'SELECT id FROM users WHERE teacher_no = ? AND teacher_no IS NOT NULL LIMIT 1',
        [row.teacher_no]
      );
      if (dupT.length) throw new Error('工号已被占用');
      if (row.email) {
        const [dupE] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [row.email]);
        if (dupE.length) throw new Error('邮箱已被占用');
      }

      const hp = await hashInitialTeacherPassword(row.teacher_no);
      if (!hp.ok) throw new Error(hp.message);

      const [result] = await pool.query(
        `INSERT INTO users
          (username, password, password_plain, real_name, teacher_no, phone, role, email, department, must_change_password)
         VALUES (?, ?, NULL, ?, ?, ?, 'teacher', ?, ?, 1)`,
        [
          row.username,
          hp.hash,
          row.real_name,
          row.teacher_no,
          row.phone || null,
          row.email,
          row.department,
        ]
      );

      await pool.query(
        `UPDATE teacher_import_rows SET status = 'imported', created_user_id = ?, imported_at = NOW(), errors_json = '[]'
         WHERE id = ?`,
        [result.insertId, row.id]
      );
      importedRows += 1;
    } catch (e) {
      failedRows += 1;
      await pool.query(
        `UPDATE teacher_import_rows SET status = 'failed', errors_json = ? WHERE id = ?`,
        [JSON.stringify([e.message || '导入失败']), row.id]
      );
    }
  }

  const finalStatus = failedRows > 0 && importedRows === 0 ? 'failed' : 'completed';
  await pool.query(
    `UPDATE teacher_import_batches
     SET status = ?, imported_rows = ?, failed_rows = ?, completed_at = NOW()
     WHERE id = ?`,
    [finalStatus, importedRows, failedRows, batchId]
  );

  return {
    batchId: Number(batchId),
    importedRows,
    failedRows,
    skippedRows: 0,
    status: finalStatus,
  };
}

async function listBatches({ page = 1, pageSize = 10, status }) {
  const offset = (page - 1) * pageSize;
  let where = '1=1';
  const params = [];
  if (status) {
    where += ' AND b.status = ?';
    params.push(status);
  }
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM teacher_import_batches b WHERE ${where}`,
    params
  );
  const [rows] = await pool.query(
    `SELECT b.*, u.real_name AS uploader_name
     FROM teacher_import_batches b
     LEFT JOIN users u ON u.id = b.uploaded_by
     WHERE ${where}
     ORDER BY b.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return { data: rows, total, page, pageSize };
}

async function getBatchDetail(batchId) {
  const batch = await getBatchById(batchId);
  if (!batch) return null;
  const [rows] = await pool.query(
    `SELECT id, batch_id, \`row_number\`, username, real_name, teacher_no, phone, email, department,
            valid, status, errors_json, created_user_id, imported_at
     FROM teacher_import_rows WHERE batch_id = ? ORDER BY \`row_number\``,
    [batchId]
  );
  const [uploaderRows] = await pool.query('SELECT real_name, username FROM users WHERE id = ?', [
    batch.uploaded_by,
  ]);
  return {
    batch: {
      ...batch,
      uploader_name: uploaderRows[0]?.real_name || uploaderRows[0]?.username || null,
    },
    rows: rows.map((r) => ({
      ...r,
      errors: (() => {
        try {
          return typeof r.errors_json === 'string' ? JSON.parse(r.errors_json) : r.errors_json || [];
        } catch {
          return [];
        }
      })(),
    })),
  };
}

async function buildResultExcelBuffer(batchId) {
  const detail = await getBatchDetail(batchId);
  if (!detail) {
    const err = new Error('导入批次不存在');
    err.status = 404;
    throw err;
  }
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('导入结果');
  sheet.addRow([
    '行号',
    '用户名',
    '真实姓名',
    '工号',
    '邮箱',
    '学院 / 部门',
    '电话号码',
    '状态',
    '错误原因',
    '创建用户ID',
  ]);
  sheet.getRow(1).font = { bold: true };
  for (const r of detail.rows) {
    sheet.addRow([
      r.row_number,
      r.username || '',
      r.real_name || '',
      r.teacher_no || '',
      r.email || '',
      r.department || '',
      r.phone || '',
      r.status || '',
      (r.errors || []).join('；'),
      r.created_user_id || '',
    ]);
  }
  return wb.xlsx.writeBuffer();
}

async function saveUploadFile(buffer, originalName) {
  ensureUploadDir();
  const safe = String(originalName || 'import.xlsx').replace(/[^\w.\-()\u4e00-\u9fff]/g, '_');
  const fname = `${Date.now()}_${safe}`;
  const full = path.join(UPLOAD_DIR, fname);
  fs.writeFileSync(full, buffer);
  return full;
}

async function getTeacherSummary() {
  const [[totalRow]] = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE role = 'teacher'`);
  const [[deptRow]] = await pool.query(
    `SELECT COUNT(DISTINCT department) AS c FROM users WHERE role = 'teacher' AND department IS NOT NULL AND department <> ''`
  );
  const [[mustChangeRow]] = await pool.query(
    `SELECT COUNT(*) AS c FROM users WHERE role = 'teacher' AND IFNULL(must_change_password, 0) = 1`
  );
  const [[monthRow]] = await pool.query(
    `SELECT COUNT(*) AS c FROM users WHERE role = 'teacher' AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')`
  );
  const [[missingNoRow]] = await pool.query(
    `SELECT COUNT(*) AS c FROM users WHERE role = 'teacher' AND (teacher_no IS NULL OR teacher_no = '')`
  );
  const [deptRows] = await pool.query(
    `SELECT DISTINCT department FROM users WHERE role = 'teacher' AND department IS NOT NULL AND department <> '' ORDER BY department`
  );
  return {
    total: totalRow.c,
    departmentCount: deptRow.c,
    mustChangePassword: mustChangeRow.c,
    monthNew: monthRow.c,
    missingTeacherNo: missingNoRow.c,
    departments: deptRows.map((r) => r.department),
  };
}

module.exports = {
  MAX_ROWS,
  buildImportTemplateBuffer,
  previewImport,
  confirmImport,
  listBatches,
  getBatchDetail,
  buildResultExcelBuffer,
  saveUploadFile,
  getTeacherSummary,
};
