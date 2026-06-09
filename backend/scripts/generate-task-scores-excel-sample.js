/**
 * 生成任务维度成绩 Excel 样例（含未提交学生）
 * node scripts/generate-task-scores-excel-sample.js
 */
const fs = require('fs');
const path = require('path');
const { formatDateTime } = require('../utils/exportFormatters');
const { writeWorkbookFile } = require('../utils/excelExportHelper');
const { buildTaskScoresWorkbook } = require('../utils/taskScoresExport');

const OUT_DIR = path.join(__dirname, '..', 'exports', 'samples');

function mockRosterRows() {
  const base = {
    task_title: '任务一：系统调用与内核模块实验',
    course_name: '龙芯架构程序设计',
    teaching_class_name: 'TEST-JW-01 教学班',
    term_name: '2025-2026 学年第一学期',
    project_name: 'LoongArch 综合实训项目',
  };
  return [
    {
      real_name: '张实训',
      student_no: '2024001001',
      admin_class_name: '软件工程 2201 班',
      submission_id: 101,
      submitted_at: new Date('2026-05-09 18:32:15'),
      status: 'human_graded',
      total_score: 88,
      human_score: 90,
      enterprise_score: 86,
      final_score: 89,
      ...base,
    },
    {
      real_name: '李同学',
      student_no: '2024001002',
      admin_class_name: '软件工程 2201 班',
      submission_id: 102,
      submitted_at: new Date('2026-05-10 09:15:00'),
      status: 'ai_graded',
      total_score: 76,
      human_score: null,
      enterprise_score: null,
      final_score: null,
      ...base,
    },
    {
      real_name: '王未交',
      student_no: '2024001003',
      admin_class_name: '软件工程 2201 班',
      submission_id: null,
      submitted_at: null,
      status: null,
      total_score: null,
      human_score: null,
      enterprise_score: null,
      final_score: null,
      ...base,
    },
    {
      real_name: '赵待批',
      student_no: '2024001004',
      admin_class_name: '软件工程 2202 班',
      submission_id: 104,
      submitted_at: new Date('2026-05-11 20:45:30'),
      status: 'pending',
      total_score: null,
      human_score: null,
      enterprise_score: null,
      final_score: null,
      ...base,
    },
  ];
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const meta = {
    scopeLabel: '任务：任务一：系统调用与内核模块实验 · 教学班：龙芯架构程序设计 · TEST-JW-01 教学班',
    exportTime: formatDateTime(new Date()),
    exportAccount: '李老师（teacher-demo）',
    taskTitle: '任务一：系统调用与内核模块实验',
    detailTitle: '龙芯智训 · 任务成绩统计表',
    summaryTitle: '任务成绩统计摘要',
  };

  const { workbook } = buildTaskScoresWorkbook(mockRosterRows(), meta);
  const outPath = path.join(OUT_DIR, 'sample-task-scores-export.xlsx');
  await writeWorkbookFile(workbook, outPath);
  console.log('[samples] 任务 Excel:', outPath);
}

main().catch((e) => {
  console.error('[samples] 失败:', e.message);
  process.exitCode = 1;
});
