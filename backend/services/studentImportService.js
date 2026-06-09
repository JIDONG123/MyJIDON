const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const {
  buildImportTemplateBuffer,
  parseImportWorkbook,
  validateEmail,
  validatePhone,
} = require('../utils/studentImportExcel');
const { hashInitialStudentPassword, validateInitialStudentPassword } = require('../utils/passwordPolicy');
const { validateExcelImport } = require('./contentSafetyService');
const ExcelJS = require('exceljs');

const MAX_ROWS = 500;
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'student-imports');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function generateBatchNo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `SIMP${ts}${rnd}`;
}

function fileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function loadClassNameMap() {
  const [rows] = await pool.query('SELECT id, class_name FROM classes');
  const map = new Map();
  for (const r of rows) {
    map.set(String(r.class_name).trim(), r.id);
  }
  return map;
}

async function loadExistingUserKeys() {
  const [rows] = await pool.query(
    `SELECT username, student_no, email FROM users WHERE role = 'student' OR username IS NOT NULL`
  );
  const usernames = new Set();
  const studentNos = new Set();
  const emails = new Set();
  for (const r of rows) {
    if (r.username) usernames.add(String(r.username).trim().toLowerCase());
    if (r.student_no) studentNos.add(String(r.student_no).trim());
    if (r.email) emails.add(String(r.email).trim().toLowerCase());
  }
  return { usernames, studentNos, emails };
}

function validateRow(row, ctx) {
  const errors = [];
  const username = row.username?.trim();
  const realName = row.realName?.trim();
  const studentNo = row.studentNo?.trim();
  const phone = row.phone?.trim();
  const email = row.email?.trim().toLowerCase();
  const className = row.className?.trim();

  if (!username) errors.push('用户名不能为空');
  if (!realName) errors.push('真实姓名不能为空');
  if (!studentNo) errors.push('学号不能为空');
  if (!phone) errors.push('电话号码不能为空');
  if (!email) errors.push('邮箱不能为空');

  if (username) {
    const ul = username.toLowerCase();
    if (ctx.seenUsernames.has(ul)) errors.push('Excel 内用户名重复');
    else ctx.seenUsernames.add(ul);
    if (ctx.existingUsernames.has(ul)) errors.push('用户名已被占用');
  }

  if (studentNo) {
    if (ctx.seenStudentNos.has(studentNo)) errors.push('Excel 内学号重复');
    else ctx.seenStudentNos.add(studentNo);
    if (ctx.existingStudentNos.has(studentNo)) errors.push('学号已被占用');
    const pv = validateInitialStudentPassword(studentNo);
    if (!pv.ok) errors.push(pv.message);
  }

  if (email) {
    if (!validateEmail(email)) errors.push('邮箱格式不正确');
    if (ctx.seenEmails.has(email)) errors.push('Excel 内邮箱重复');
    else ctx.seenEmails.add(email);
    if (ctx.existingEmails.has(email)) errors.push('邮箱已被占用');
  }

  if (phone && !validatePhone(phone)) errors.push('电话号码格式不正确');

  let classId = null;
  if (className) {
    classId = ctx.classMap.get(className) ?? null;
    if (!classId) errors.push('班级名称不存在');
  }

  return {
    username,
    realName,
    studentNo,
    phone,
    email,
    className: className || null,
    classId,
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

  const classMap = await loadClassNameMap();
  const existing = await loadExistingUserKeys();
  const ctx = {
    classMap,
    existingUsernames: existing.usernames,
    existingStudentNos: existing.studentNos,
    existingEmails: existing.emails,
    seenUsernames: new Set(),
    seenStudentNos: new Set(),
    seenEmails: new Set(),
  };

  const validated = parsed.map((row) => ({
    rowNumber: row.rowNumber,
    ...validateRow(row, ctx),
  }));

  const safety = await validateExcelImport(buffer, 'student');
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
      `INSERT INTO student_import_batches
        (batch_no, file_name, file_path, file_hash, uploaded_by, total_rows, valid_rows, error_rows,
         status, default_password_policy, previewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'previewed', 'student_no', ?)`,
      [batchNo, originalName, savedPath || null, hash, uploadedBy, validated.length, validRows, errorRows, now]
    );
    const batchId = batchResult.insertId;

    for (const row of validated) {
      await conn.query(
        `INSERT INTO student_import_rows
          (batch_id, \`row_number\`, username, real_name, student_no, phone, email, class_name, class_id,
           password_policy, valid, status, errors_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'student_no', ?, ?, ?)`,
        [
          batchId,
          row.rowNumber,
          row.username,
          row.realName,
          row.studentNo,
          row.phone,
          row.email,
          row.className,
          row.classId,
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
        studentNo: r.studentNo,
        phone: r.phone,
        email: r.email,
        className: r.className,
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
  const [rows] = await pool.query('SELECT * FROM student_import_batches WHERE id = ? LIMIT 1', [batchId]);
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
    `UPDATE student_import_batches SET status = 'importing', confirmed_at = NOW() WHERE id = ? AND status = 'previewed'`,
    [batchId]
  );

  const [rowRows] = await pool.query(
    `SELECT * FROM student_import_rows WHERE batch_id = ? AND valid = 1 AND status = 'valid' ORDER BY \`row_number\``,
    [batchId]
  );

  let importedRows = 0;
  let failedRows = 0;

  for (const row of rowRows) {
    try {
      const [dupU] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', [row.username]);
      if (dupU.length) throw new Error('用户名已被占用');
      const [dupS] = await pool.query(
        'SELECT id FROM users WHERE student_no = ? AND student_no IS NOT NULL LIMIT 1',
        [row.student_no]
      );
      if (dupS.length) throw new Error('学号已被占用');
      if (row.email) {
        const [dupE] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [row.email]);
        if (dupE.length) throw new Error('邮箱已被占用');
      }

      const hp = await hashInitialStudentPassword(row.student_no);
      if (!hp.ok) throw new Error(hp.message);

      const [result] = await pool.query(
        `INSERT INTO users
          (username, password, password_plain, real_name, student_no, phone, role, email, class_id, must_change_password)
         VALUES (?, ?, NULL, ?, ?, ?, 'student', ?, ?, 1)`,
        [
          row.username,
          hp.hash,
          row.real_name,
          row.student_no,
          row.phone,
          row.email,
          row.class_id || null,
        ]
      );

      await pool.query(
        `UPDATE student_import_rows SET status = 'imported', created_user_id = ?, imported_at = NOW(), errors_json = '[]'
         WHERE id = ?`,
        [result.insertId, row.id]
      );
      importedRows += 1;
    } catch (e) {
      failedRows += 1;
      await pool.query(
        `UPDATE student_import_rows SET status = 'failed', errors_json = ? WHERE id = ?`,
        [JSON.stringify([e.message || '导入失败']), row.id]
      );
    }
  }

  const finalStatus = failedRows > 0 && importedRows === 0 ? 'failed' : 'completed';
  await pool.query(
    `UPDATE student_import_batches
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
    `SELECT COUNT(*) AS total FROM student_import_batches b WHERE ${where}`,
    params
  );
  const [rows] = await pool.query(
    `SELECT b.*, u.real_name AS uploader_name
     FROM student_import_batches b
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
    `SELECT id, batch_id, \`row_number\`, username, real_name, student_no, phone, email, class_name, class_id,
            valid, status, errors_json, created_user_id, imported_at
     FROM student_import_rows WHERE batch_id = ? ORDER BY \`row_number\``,
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
    '学号',
    '电话号码',
    '邮箱',
    '班级名称',
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
      r.student_no || '',
      r.phone || '',
      r.email || '',
      r.class_name || '',
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

async function getStudentSummary() {
  const [[totalRow]] = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE role = 'student'`);
  const [[assignedRow]] = await pool.query(
    `SELECT COUNT(*) AS c FROM users WHERE role = 'student' AND class_id IS NOT NULL`
  );
  const [[mustChangeRow]] = await pool.query(
    `SELECT COUNT(*) AS c FROM users WHERE role = 'student' AND IFNULL(must_change_password, 0) = 1`
  );
  const [[monthRow]] = await pool.query(
    `SELECT COUNT(*) AS c FROM users WHERE role = 'student' AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')`
  );
  return {
    total: totalRow.c,
    assigned: assignedRow.c,
    unassigned: totalRow.c - assignedRow.c,
    mustChangePassword: mustChangeRow.c,
    monthNew: monthRow.c,
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
  getStudentSummary,
};
