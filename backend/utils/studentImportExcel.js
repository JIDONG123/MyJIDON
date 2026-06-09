const ExcelJS = require('exceljs');
const XLSX = require('xlsx');

const HEADERS = ['用户名 *', '真实姓名 *', '学号 *', '电话号码 *', '邮箱 *', '班级名称'];

const HEADER_MAP = {
  '用户名 *': 'username',
  用户名: 'username',
  '真实姓名 *': 'realName',
  真实姓名: 'realName',
  '学号 *': 'studentNo',
  学号: 'studentNo',
  '电话号码 *': 'phone',
  电话号码: 'phone',
  '邮箱 *': 'email',
  邮箱: 'email',
  班级名称: 'className',
};

const INSTRUCTIONS = [
  '填写说明：',
  '1. 带 * 为必填字段。',
  '2. 用户名不可重复。',
  '3. 学号不可重复。',
  '4. 电话号码和邮箱必须填写。',
  '5. 班级名称为选填。',
  '6. 如填写班级名称，必须与系统中的行政班名称完全一致。',
  '7. 如不填写班级名称，学生将被导入为“未分配班级”状态，管理员可后续分配。',
  '8. 初始密码默认为学号。',
  '9. 学生首次登录必须修改初始密码。',
];

async function buildImportTemplateBuffer() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('学生账号导入');
  sheet.addRow(HEADERS);
  sheet.addRow([
    'student2026001',
    '张三',
    '2026001',
    '13800000001',
    'zhangsan@example.com',
    '软件2101班',
  ]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = [
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 28 },
    { width: 18 },
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
    const key = HEADER_MAP[raw] || HEADER_MAP[normalizeHeader(raw).replace(/\*/g, ' *')];
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
  const requiredKeys = ['username', 'realName', 'studentNo', 'phone', 'email'];
  const mappedKeys = new Set(Object.values(headerMap));
  for (const k of requiredKeys) {
    if (!mappedKeys.has(k)) {
      throw new Error(`缺少必填列：${k}`);
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

function validateEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
  if (!phone) return false;
  const s = String(phone).trim();
  if (/^1\d{10}$/.test(s)) return true;
  return /^[\d+\-]{6,20}$/.test(s);
}

module.exports = {
  HEADERS,
  buildImportTemplateBuffer,
  parseImportWorkbook,
  validateEmail,
  validatePhone,
};
