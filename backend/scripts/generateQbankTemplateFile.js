/**
 * 生成题库导入模板 xlsx（供前端静态目录 + 后端接口优先读取）
 * 用法：在 backend 目录 node scripts/generateQbankTemplateFile.js
 */
const fs = require('fs');
const path = require('path');
const { buildImportTemplateBuffer } = require('../utils/qbExcel');

const buf = Buffer.from(buildImportTemplateBuffer());

const outs = [
  path.join(__dirname, '..', '..', 'frontend', 'public', 'qbank-import-template.xlsx'),
  path.join(__dirname, '..', 'templates', 'qbank-import-template.xlsx'),
];

for (const out of outs) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  console.log('written', out, fs.statSync(out).size);
}
