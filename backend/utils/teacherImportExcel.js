const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const { validateEmail, validatePhone } = require('./studentImportExcel');

const HEADERS = ['用户名 *', '真实姓名 *', '工号 *', '邮箱 *', '学院 / 部门 *', '电话号码'];

const HEADER_MAP = {
  '用户名 *': 'username',
  用户名: 'username',
  '真实姓名 *': 'realName',
  真实姓名: 'realName',
  '工号 *': 'teacherNo',
  工号: 'teacherNo',
  '邮箱 *': 'email',
  邮箱: 'email',
  '学院 / 部门 *': 'department',
  '学院/部门*': 'department',
  '学院/部门': 'department',
  学院部门: 'department',
  电话号码: 'phone',
};

const INSTRUCTIONS = [
  '填写说明：',
  '1. 带 * 为必填字段。',
  '2. 用户名不可重复。',
  '3. 工号不可重复。',
  '4. 邮箱必须填写且格式正确。',
  '5. 学院 / 部门必须填写。',
  '6. 电话号码为选填。',
  '7. 初始密码默认为工号。',
  '8. 教师首次登录必须修改初始密码。',
  '9. 教师负责班级关系请在“班级管理”页面中维护。',
];

async function buildImportTemplateBuffer() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('教师账号导入');
  sheet.addRow(HEADERS);
  sheet.addRow([
    'teacher2026001',
    '李老师',
    'T2026001',
    'teacher2026001@example.com',
    '计算机学院',
    '13800000002',
  ]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = [
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 28 },
    { width: 18 },
    { width: 16 },
  ];

  const note = workbook.addWorksheet('填写说明');
  INSTRUCTIONS.forEach((line) => note.addRow([line]));
  note.getColumn(1).width = 72;

  return workbook.xlsx.writeBuffer();
}

function normalizeHeader(cell) {
  return String(cell || '')
    .trim()
    .replace(/\s+/g, '');
}

function mapHeaderRow(row) {
  const map = {};
  row.forEach((cell, idx) => {
    const raw = String(cell || '').trim();
    let key = HEADER_MAP[raw];
    if (!key) {
      const norm = normalizeHeader(raw).replace(/\*/g, ' *');
      key = HEADER_MAP[norm] || HEADER_MAP[normalizeHeader(raw)];
    }
    if (key) map[idx] = key;
  });
  return map;
}

function isEmptyRow(values) {
  return !values.some((v) => String(v ?? '').trim() !== '');
}

function parseImportWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel 文件无有效工作表');
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows.length) {
    throw new Error('Excel 文件为空');
  }
  const headerMap = mapHeaderRow(rows[0]);
  const requiredKeys = ['username', 'realName', 'teacherNo', 'email', 'department'];
  const mappedKeys = new Set(Object.values(headerMap));
  for (const k of requiredKeys) {
    if (!mappedKeys.has(k)) {
      const labels = {
        username: '用户名',
        realName: '真实姓名',
        teacherNo: '工号',
        email: '邮箱',
        department: '学院 / 部门',
      };
      throw new Error(`缺少必填列：${labels[k] || k}`);
    }
  }

  const parsed = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || isEmptyRow(row)) continue;
    const item = { rowNumber: i + 1 };
    for (const [colIdx, key] of Object.entries(headerMap)) {
      item[key] = String(row[colIdx] ?? '').trim();
    }
    parsed.push(item);
  }
  return parsed;
}

module.exports = {
  HEADERS,
  buildImportTemplateBuffer,
  parseImportWorkbook,
  validateEmail,
  validatePhone,
};
