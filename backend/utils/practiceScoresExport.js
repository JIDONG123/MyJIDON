const pool = require('../config/database');
const {
  DASH,
  formatDateTime,
  formatScore,
  emptyDash,
  gradingStatusLabel,
  toExcelDate,
  toExcelScore,
} = require('./exportFormatters');
const {
  createWorkbook,
  addMergedTitleRow,
  addMetaRows,
  addStyledHeader,
  freezeHeader,
  autoFitColumns,
  styleDataRow,
  BORDER_THIN,
  META_LABEL_FONT,
  META_VALUE_FONT,
} = require('./excelExportHelper');

const DETAIL_HEADERS = [
  '序号',
  '姓名',
  '学号',
  '行政班',
  '课程',
  '教学班',
  '学期',
  '实训项目',
  '任务名称',
  'AI分',
  '教师分',
  '企业导师分',
  '综合分',
  '批改状态',
  '提交时间',
];

const SCORE_COLS = [10, 11, 12, 13];
const DATE_COL = 15;

async function resolveScopeExportLabel(scope) {
  if (scope.type === 'legacy_class') {
    const [rows] = await pool.query('SELECT class_name FROM classes WHERE id = ?', [scope.scopeId]);
    if (!rows.length) return `行政班（ID ${scope.scopeId}）`;
    return `行政班：${rows[0].class_name}`;
  }
  if (scope.type === 'teaching_class') {
    const [rows] = await pool.query(
      `SELECT tc.class_name, c.course_name
       FROM teaching_classes tc
       INNER JOIN courses c ON c.id = tc.course_id
       WHERE tc.id = ?`,
      [scope.scopeId]
    );
    if (!rows.length) return `教学班（ID ${scope.scopeId}）`;
    return `教学班：${rows[0].course_name} · ${rows[0].class_name}`;
  }
  if (scope.type === 'course') {
    const [rows] = await pool.query('SELECT course_name FROM courses WHERE id = ?', [scope.scopeId]);
    if (!rows.length) return `课程（ID ${scope.scopeId}）`;
    return `课程：${rows[0].course_name}`;
  }
  return `范围：${scope.type} #${scope.scopeId}`;
}

function exportAccountLabel(user) {
  if (!user) return DASH;
  const name = user.real_name || user.realName;
  const account = user.username || user.email;
  if (name && account && name !== account) return `${name}（${account}）`;
  return name || account || `用户#${user.id}`;
}

function mapDetailRow(index, row) {
  const hasSubmission = row.hasSubmission !== false;
  return [
    index + 1,
    emptyDash(row.studentName),
    emptyDash(row.studentNo != null && row.studentNo !== '' ? String(row.studentNo) : null),
    emptyDash(row.adminClassName),
    emptyDash(row.courseName),
    emptyDash(row.teachingClassName),
    emptyDash(row.termName),
    emptyDash(row.projectName),
    emptyDash(row.taskName),
    hasSubmission ? toExcelScore(row.aiScore) : DASH,
    hasSubmission ? toExcelScore(row.humanScore) : DASH,
    hasSubmission ? toExcelScore(row.enterpriseScore) : DASH,
    hasSubmission ? toExcelScore(row.finalScore) : DASH,
    gradingStatusLabel(row.status, hasSubmission),
    hasSubmission ? toExcelDate(row.submittedAt) : DASH,
  ];
}

function computeSummaryStats(rows) {
  const finalScores = rows
    .map((r) => {
      if (r.hasSubmission === false) return null;
      return toExcelScore(r.finalScore);
    })
    .filter((v) => typeof v === 'number' && Number.isFinite(v));
  const reviewedCount = rows.filter((r) => r.hasSubmission !== false && r.status === 'human_graded').length;
  const submittedCount = rows.filter((r) => r.hasSubmission !== false).length;
  return {
    recordCount: rows.length,
    submittedCount,
    validScoreCount: finalScores.length,
    avg:
      finalScores.length > 0
        ? formatScore(finalScores.reduce((a, b) => a + b, 0) / finalScores.length)
        : DASH,
    max: finalScores.length > 0 ? formatScore(Math.max(...finalScores)) : DASH,
    min: finalScores.length > 0 ? formatScore(Math.min(...finalScores)) : DASH,
    reviewedCount,
  };
}

function buildSummarySheet(sheet, meta, stats) {
  const colCount = 2;
  addMergedTitleRow(sheet, 1, meta.summaryTitle || '实训成绩统计摘要', colCount, { height: 28 });
  sheet.getRow(2).height = 6;

  const pairs = [
    { label: '导出范围', value: meta.scopeLabel },
    { label: '记录数', value: String(stats.recordCount) },
  ];
  if (stats.submittedCount != null) {
    pairs.push({ label: '已提交人数', value: String(stats.submittedCount) });
  }
  pairs.push(
    { label: '有效成绩数', value: String(stats.validScoreCount) },
    { label: '平均分', value: stats.avg },
    { label: '最高分', value: stats.max },
    { label: '最低分', value: stats.min },
    { label: '已复核数量', value: String(stats.reviewedCount) },
    { label: '导出时间', value: meta.exportTime },
    { label: '导出账号', value: meta.exportAccount }
  );
  if (meta.taskTitle) {
    pairs.splice(1, 0, { label: '任务名称', value: meta.taskTitle });
  }

  let row = 3;
  for (const pair of pairs) {
    const r = sheet.getRow(row);
    r.getCell(1).value = pair.label;
    r.getCell(1).font = META_LABEL_FONT;
    r.getCell(1).border = BORDER_THIN;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(2).value = pair.value;
    r.getCell(2).font = META_VALUE_FONT;
    r.getCell(2).border = BORDER_THIN;
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    r.height = 22;
    row += 1;
  }

  sheet.getColumn(1).width = 16;
  sheet.getColumn(2).width = 48;
}

function buildDetailSheet(sheet, rows, meta) {
  const colCount = DETAIL_HEADERS.length;
  let row = 1;

  addMergedTitleRow(sheet, row, meta.detailTitle || '龙芯智训 · 实训成绩明细表', colCount);
  row += 1;
  const metaPairs = [
    { label: '导出范围', value: meta.scopeLabel },
    { label: '导出时间', value: meta.exportTime },
    { label: '导出账号', value: meta.exportAccount },
  ];
  if (meta.taskTitle) {
    metaPairs.unshift({ label: '任务名称', value: meta.taskTitle });
  }
  row = addMetaRows(sheet, row, metaPairs, colCount);
  row += 1;

  const headerRow = row;
  addStyledHeader(sheet, headerRow, DETAIL_HEADERS, 1, 'dark');

  const dataStartRow = headerRow + 1;
  let dataEndRow = headerRow;

  rows.forEach((src, idx) => {
    const values = mapDetailRow(idx, src);
    dataEndRow = dataStartRow + idx;
    const r = sheet.getRow(dataEndRow);
    values.forEach((val, ci) => {
      r.getCell(ci + 1).value = val;
    });
    styleDataRow(sheet, dataEndRow, colCount, idx % 2 === 1);
  });

  if (rows.length === 0) {
    dataEndRow = dataStartRow;
    const r = sheet.getRow(dataStartRow);
    r.getCell(1).value = DASH;
    sheet.mergeCells(dataStartRow, 1, dataStartRow, colCount);
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(1).font = META_VALUE_FONT;
    styleDataRow(sheet, dataStartRow, colCount, false);
  }

  if (rows.length > 0) {
    for (let r = dataStartRow; r <= dataEndRow; r += 1) {
      for (const c of SCORE_COLS) {
        const cell = sheet.getRow(r).getCell(c);
        if (typeof cell.value === 'number') {
          cell.numFmt = '0.00';
        }
      }
      const dateCell = sheet.getRow(r).getCell(DATE_COL);
      if (dateCell.value instanceof Date) {
        dateCell.numFmt = 'yyyy-mm-dd hh:mm:ss';
      }
    }
  }

  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: dataEndRow, column: colCount },
    };
  } else {
    sheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow, column: colCount },
    };
  }
  freezeHeader(sheet, headerRow, 1);
  autoFitColumns(sheet, 1, colCount, headerRow, dataStartRow, Math.max(dataStartRow, dataEndRow));
}

/**
 * @param {object[]} rows
 * @param {object} meta
 * @param {{ detailSheetName?: string, summarySheetName?: string }} [options]
 */
function buildPracticeScoresWorkbook(rows, meta, options = {}) {
  const stats = computeSummaryStats(rows);
  const workbook = createWorkbook();

  const detailSheet = workbook.addWorksheet(options.detailSheetName || '成绩明细', {
    views: [{ showGridLines: true }],
  });
  buildDetailSheet(detailSheet, rows, meta);

  const summarySheet = workbook.addWorksheet(options.summarySheetName || '统计摘要', {
    views: [{ showGridLines: true }],
  });
  buildSummarySheet(summarySheet, meta, stats);

  return { workbook, stats };
}

module.exports = {
  DETAIL_HEADERS,
  resolveScopeExportLabel,
  exportAccountLabel,
  buildPracticeScoresWorkbook,
  computeSummaryStats,
  mapDetailRow,
};
