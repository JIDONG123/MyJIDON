/**
 * 生成实训汇总 PDF 样例
 * node scripts/generate-practice-summary-pdf-sample.js
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { formatDateTime } = require('../utils/exportFormatters');
const {
  MARGIN,
  registerChineseFont,
  createLayoutContext,
  drawFootersOnAllPages,
} = require('../utils/pdfReportLayout');
const { renderPracticeSummaryPdf } = require('../utils/practiceSummaryPdf');

const OUT_DIR = path.join(__dirname, '..', 'exports', 'samples');

function mockRows() {
  return [
    {
      student_name: '张实训',
      student_no: '2024001001',
      admin_class_name: '软件工程 2201 班',
      course_name: '龙芯架构程序设计',
      teaching_class_name: 'TEST-JW-01 教学班',
      task_name: '任务一：系统调用实验',
      ai_score: 88,
      human_score: 90,
      enterprise_score: 86,
      final_score: 89,
      status: 'human_graded',
      submitted_at: new Date('2026-05-09 18:32:15'),
    },
    {
      student_name: '李同学',
      student_no: '2024001002',
      admin_class_name: '软件工程 2201 班',
      course_name: '龙芯架构程序设计',
      teaching_class_name: 'TEST-JW-01 教学班',
      task_name: '任务二：内核模块开发',
      ai_score: 76,
      human_score: null,
      enterprise_score: null,
      final_score: 76,
      status: 'ai_graded',
      submitted_at: new Date('2026-05-10 09:15:00'),
    },
    {
      student_name: '王测试',
      student_no: '2024001003',
      admin_class_name: '软件工程 2202 班',
      course_name: '龙芯架构程序设计',
      teaching_class_name: 'TEST-JW-01 教学班',
      task_name: '任务一：系统调用实验',
      ai_score: 92,
      human_score: 94,
      enterprise_score: 91,
      final_score: 93,
      status: 'human_graded',
      submitted_at: new Date('2026-05-11 20:45:30'),
    },
  ];
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const outPath = path.join(OUT_DIR, 'sample-practice-summary.pdf');
  const meta = {
    mainTitle: '龙芯智训·教学班实训成绩汇总表',
    subTitle: '龙芯架构程序设计 · TEST-JW-01 教学班',
    scopeLabel: '教学班：龙芯架构程序设计 · TEST-JW-01 教学班',
    exportTime: formatDateTime(new Date()),
    exportAccount: '李老师（teacher-demo）',
  };

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      bufferPages: true,
    });
    const fontReg = registerChineseFont(doc);
    if (!fontReg.fontPath) {
      reject(new Error(fontReg.error || '未找到中文字体'));
      return;
    }
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);
    const ctx = createLayoutContext(doc, fontReg.fontPath, { exportTime: new Date() });
    renderPracticeSummaryPdf(ctx, mockRows(), meta);
    drawFootersOnAllPages(ctx);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.end();
  });

  console.log('[samples] 汇总 PDF:', outPath);
}

main().catch((e) => {
  console.error('[samples] 失败:', e.message);
  process.exitCode = 1;
});
