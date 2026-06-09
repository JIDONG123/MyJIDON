/**
 * 生成班级/教学班/课程汇总 Excel 样例
 * node scripts/generate-practice-scores-excel-sample.js
 */
const fs = require('fs');
const path = require('path');
const { formatDateTime } = require('../utils/exportFormatters');
const { writeWorkbookFile } = require('../utils/excelExportHelper');
const { buildPracticeScoresWorkbook } = require('../utils/practiceScoresExport');

const OUT_DIR = path.join(__dirname, '..', 'exports', 'samples');

function mockRows() {
  const base = {
    courseName: '龙芯架构程序设计',
    teachingClassName: 'TEST-JW-01 教学班',
    termName: '2025-2026 学年第一学期',
    projectName: 'LoongArch 综合实训项目',
  };
  return [
    {
      studentName: '张实训',
      studentNo: '2024001001',
      adminClassName: '软件工程 2201 班',
      taskName: '任务一：系统调用实验',
      aiScore: 88,
      humanScore: 90,
      enterpriseScore: 86,
      finalScore: 89,
      status: 'human_graded',
      submittedAt: new Date('2026-05-09 18:32:15'),
      ...base,
    },
    {
      studentName: '李同学',
      studentNo: '2024001002',
      adminClassName: '软件工程 2201 班',
      taskName: '任务一：系统调用实验',
      aiScore: 76,
      humanScore: null,
      enterpriseScore: null,
      finalScore: 76,
      status: 'ai_graded',
      submittedAt: new Date('2026-05-10 09:15:00'),
      ...base,
    },
    {
      studentName: '王测试',
      studentNo: '2024001003',
      adminClassName: '软件工程 2202 班',
      taskName: '任务二：内核模块开发',
      aiScore: 92,
      humanScore: 94,
      enterpriseScore: 91,
      finalScore: 93,
      status: 'human_graded',
      submittedAt: new Date('2026-05-11 20:45:30'),
      ...base,
    },
    {
      studentName: '赵待批',
      studentNo: '2024001004',
      adminClassName: '软件工程 2202 班',
      taskName: '任务二：内核模块开发',
      aiScore: null,
      humanScore: null,
      enterpriseScore: null,
      finalScore: null,
      status: 'pending',
      submittedAt: new Date('2026-05-12 08:00:00'),
      ...base,
    },
    {
      studentName: '钱批改中',
      studentNo: '2024001005',
      adminClassName: '软件工程 2203 班',
      taskName: '任务三：性能优化报告',
      aiScore: null,
      humanScore: null,
      enterpriseScore: null,
      finalScore: null,
      status: 'ai_grading',
      submittedAt: new Date('2026-05-12 10:20:00'),
      ...base,
    },
  ];
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const meta = {
    scopeLabel: '教学班：龙芯架构程序设计 · TEST-JW-01 教学班',
    exportTime: formatDateTime(new Date()),
    exportAccount: '李老师（teacher-demo）',
  };

  const { workbook } = buildPracticeScoresWorkbook(mockRows(), meta);
  const outPath = path.join(OUT_DIR, 'sample-practice-scores-export.xlsx');
  await writeWorkbookFile(workbook, outPath);
  console.log('[samples] 汇总 Excel:', outPath);
}

main().catch((e) => {
  console.error('[samples] 失败:', e.message);
  process.exitCode = 1;
});
