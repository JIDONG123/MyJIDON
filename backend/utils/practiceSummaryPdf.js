const pool = require('../config/database');
const { buildScopeSql } = require('./practiceStatsScope');
const { formatDateTime, formatScore, emptyDash, gradingStatusLabel, safeFileName } = require('./exportFormatters');
const {
  drawHeader,
  drawSectionTitle,
  drawKeyValueTable,
  drawScoreSummary,
  drawSimpleTable,
} = require('./pdfReportLayout');
const { resolveScopeExportLabel, exportAccountLabel } = require('./practiceScoresExport');

const SUMMARY_TABLE_HEADERS = [
  '序号',
  '姓名',
  '学号',
  '行政班',
  '课程',
  '教学班',
  '任务名称',
  'AI分',
  '教师分',
  '企业导师分',
  '综合分',
  '批改状态',
  '提交时间',
];

const LANDSCAPE_COL_WIDTHS = [22, 44, 50, 52, 58, 58, 88, 34, 34, 38, 34, 48, 68];

async function fetchPracticeSummaryRows(scope) {
  const { studentWhereSql, studentParams, taskWhereSql, taskParams } = buildScopeSql(scope);
  const scoreExpr = 'COALESCE(gr.final_score, gr.human_score, gr.total_score)';

  const [rows] = await pool.query(
    `
    SELECT
      u.real_name AS student_name,
      u.student_no AS student_no,
      lc.class_name AS admin_class_name,
      t.title AS task_name,
      co.course_name AS course_name,
      tc.class_name AS teaching_class_name,
      tm.name AS term_name,
      tpl.project_name AS project_name,
      gr.total_score AS ai_score,
      gr.human_score AS human_score,
      gr.enterprise_score AS enterprise_score,
      ${scoreExpr} AS final_score,
      gr.status,
      s.submitted_at AS submitted_at
    FROM submissions s
    JOIN users u ON u.id = s.student_id
    JOIN tasks t ON s.task_id = t.id
    LEFT JOIN classes lc ON u.class_id = lc.id
    LEFT JOIN courses co ON t.course_id = co.id
    LEFT JOIN teaching_classes tc ON t.teaching_class_id = tc.id
    LEFT JOIN terms tm ON tc.term_id = tm.id
    LEFT JOIN training_project_templates tpl ON t.project_template_id = tpl.id
    LEFT JOIN grading_results gr ON s.id = gr.submission_id
    WHERE ${studentWhereSql} AND ${taskWhereSql}
    ORDER BY co.course_name, tc.class_name, t.title, u.student_no, u.real_name
  `,
    [...studentParams, ...taskParams]
  );
  return rows;
}

function mapSummaryTableRow(row, index) {
  return [
    String(index + 1),
    emptyDash(row.student_name),
    emptyDash(row.student_no != null && row.student_no !== '' ? String(row.student_no) : null),
    emptyDash(row.admin_class_name),
    emptyDash(row.course_name),
    emptyDash(row.teaching_class_name),
    emptyDash(row.task_name),
    formatScore(row.ai_score),
    formatScore(row.human_score),
    formatScore(row.enterprise_score),
    formatScore(row.final_score),
    gradingStatusLabel(row.status, true),
    formatDateTime(row.submitted_at),
  ];
}

function computePdfSummaryStats(rows) {
  const scores = rows
    .map((r) => Number(r.final_score))
    .filter((n) => Number.isFinite(n));
  return {
    recordCount: rows.length,
    validScoreCount: scores.length,
    avg: scores.length ? formatScore(scores.reduce((a, b) => a + b, 0) / scores.length) : '—',
    max: scores.length ? formatScore(Math.max(...scores)) : '—',
    min: scores.length ? formatScore(Math.min(...scores)) : '—',
    reviewedCount: rows.filter((r) => r.status === 'human_graded').length,
  };
}

async function resolvePracticePdfMeta(scope) {
  if (scope.type === 'legacy_class') {
    const [rows] = await pool.query('SELECT class_name FROM classes WHERE id = ?', [scope.scopeId]);
    if (!rows.length) return { ok: false, status: 404, message: '班级不存在' };
    return {
      ok: true,
      mainTitle: '龙芯智训·班级实训成绩汇总表',
      subTitle: `班级：${rows[0].class_name}`,
      filename: `班级实训统计_${safeFileName(rows[0].class_name)}_${scope.scopeId}.pdf`,
    };
  }
  if (scope.type === 'teaching_class') {
    const [rows] = await pool.query(
      `SELECT tc.class_name, c.course_name
       FROM teaching_classes tc
       INNER JOIN courses c ON c.id = tc.course_id
       WHERE tc.id = ?`,
      [scope.scopeId]
    );
    if (!rows.length) return { ok: false, status: 404, message: '教学班不存在' };
    const label = `${rows[0].course_name} · ${rows[0].class_name}`;
    return {
      ok: true,
      mainTitle: '龙芯智训·教学班实训成绩汇总表',
      subTitle: label,
      filename: `教学班实训统计_${safeFileName(label)}_${scope.scopeId}.pdf`,
    };
  }
  if (scope.type === 'course') {
    const [rows] = await pool.query('SELECT course_name FROM courses WHERE id = ?', [scope.scopeId]);
    if (!rows.length) return { ok: false, status: 404, message: '课程不存在' };
    return {
      ok: true,
      mainTitle: '龙芯智训·课程实训成绩汇总表',
      subTitle: `课程：${rows[0].course_name}`,
      filename: `课程实训统计_${safeFileName(rows[0].course_name)}_${scope.scopeId}.pdf`,
    };
  }
  return { ok: false, status: 400, message: '无效的统计范围' };
}

function renderPracticeSummaryPdf(ctx, rows, meta) {
  ctx.compactHeaderTitle = meta.mainTitle || '龙芯智训 · 实训成绩汇总表';

  drawHeader(ctx, {
    mainTitle: meta.mainTitle || '龙芯智训·实训成绩汇总表',
    subTitle: meta.subTitle || '校企协同实训智慧评价平台',
  });

  drawKeyValueTable(ctx, [
    { label: '导出范围', value: meta.scopeLabel },
    { label: '导出时间', value: meta.exportTime },
    { label: '导出账号', value: meta.exportAccount },
    { label: '记录条数', value: String(rows.length) },
  ]);

  const stats = computePdfSummaryStats(rows);
  drawSectionTitle(ctx, '一、统计概览');
  drawScoreSummary(ctx, [
    { label: '有效成绩数', value: String(stats.validScoreCount) },
    { label: '平均分', value: stats.avg },
    { label: '最高分', value: stats.max },
    { label: '最低分', value: stats.min },
    { label: '已复核数', value: String(stats.reviewedCount) },
  ]);

  drawSectionTitle(ctx, '二、成绩明细');
  if (!rows.length) {
    drawSimpleTable(ctx, {
      headers: SUMMARY_TABLE_HEADERS,
      rows: [['—', '暂无提交与批改记录', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—']],
      colWidths: LANDSCAPE_COL_WIDTHS,
      headerStyle: 'dark',
      pageLayout: 'landscape',
    });
  } else {
    drawSimpleTable(ctx, {
      headers: SUMMARY_TABLE_HEADERS,
      rows: rows.map(mapSummaryTableRow),
      colWidths: LANDSCAPE_COL_WIDTHS,
      headerStyle: 'dark',
      pageLayout: 'landscape',
    });
  }
}

async function buildPracticeSummaryPdfMeta(scope, user) {
  const scopeLabel = await resolveScopeExportLabel(scope);
  return {
    scopeLabel,
    exportTime: formatDateTime(new Date()),
    exportAccount: exportAccountLabel(user),
  };
}

module.exports = {
  fetchPracticeSummaryRows,
  resolvePracticePdfMeta,
  renderPracticeSummaryPdf,
  buildPracticeSummaryPdfMeta,
  mapSummaryTableRow,
  SUMMARY_TABLE_HEADERS,
};
