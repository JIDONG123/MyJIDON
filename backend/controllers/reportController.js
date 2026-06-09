const PDFDocument = require('pdfkit');
const pool = require('../config/database');
const { teacherOwnsSubmissionTask } = require('../utils/accessControl');
const { normalizeStoredFileNameForDisplay } = require('../utils/filenameEncoding');
const { resolvePracticeScope } = require('../utils/practiceStatsScope');
const {
  formatDateTime,
  formatScore,
  emptyDash,
  gradingStatusLabel,
  safeFileName,
  similarityLevelLabel,
  formatSimilarityPercent,
  isLateSubmit,
} = require('../utils/exportFormatters');
const {
  MARGIN,
  registerChineseFont,
  createLayoutContext,
  drawHeader,
  drawFootersOnAllPages,
  drawSectionTitle,
  drawKeyValueTable,
  drawScoreSummary,
  drawSimpleTable,
  drawTextBox,
  addSignatureArea,
} = require('../utils/pdfReportLayout');
const { recordExportLog } = require('../services/exportLogService');
const {
  fetchPracticeSummaryRows,
  resolvePracticePdfMeta,
  renderPracticeSummaryPdf,
  buildPracticeSummaryPdfMeta,
} = require('../utils/practiceSummaryPdf');

const PT_A4_W = 595.28;
const CONTENT_W = PT_A4_W - MARGIN * 2;

const safeFilenamePart = safeFileName;

function parseDimensionScores(raw) {
  let dim = raw;
  if (typeof dim === 'string') {
    try {
      dim = JSON.parse(dim);
    } catch {
      dim = [];
    }
  }
  return Array.isArray(dim) ? dim : [];
}

function parseVerification(raw) {
  if (!raw) return null;
  let ver = raw;
  if (typeof ver === 'string') {
    try {
      ver = JSON.parse(ver);
    } catch {
      return null;
    }
  }
  return typeof ver === 'object' && ver ? ver : null;
}

function parseTeacherOverride(raw) {
  if (!raw) return null;
  let o = raw;
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o);
    } catch {
      return null;
    }
  }
  return typeof o === 'object' && o ? o : null;
}

function formatCodeStyleReview(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    return t || null;
  }
  if (typeof raw === 'object') {
    const parts = [];
    if (raw.summary) parts.push(String(raw.summary));
    if (Array.isArray(raw.issues) && raw.issues.length) {
      parts.push(`问题：${raw.issues.map((x) => String(x)).join('；')}`);
    }
    if (raw.suggestions) parts.push(`建议：${String(raw.suggestions)}`);
    if (raw.detail) parts.push(String(raw.detail));
    return parts.length ? parts.join('\n') : null;
  }
  return null;
}

function formatTeacherOverrideSummary(ov) {
  if (!ov || !Object.keys(ov).length) return null;
  const lines = [];
  if (ov.summary) lines.push(`修正说明：${ov.summary}`);
  if (ov.note) lines.push(`备注：${ov.note}`);
  if (ov.stepCompleteness) lines.push('步骤完整性：已按教师意见调整');
  if (ov.requirementComparison) lines.push(`任务要求对比（修正）：${ov.requirementComparison}`);
  if (ov.enterpriseAlignment) lines.push(`企业契合（修正）：${ov.enterpriseAlignment}`);
  const known = new Set(['summary', 'note', 'stepCompleteness', 'requirementComparison', 'enterpriseAlignment']);
  for (const [k, v] of Object.entries(ov)) {
    if (known.has(k) || v == null || v === '') continue;
    if (typeof v === 'object') lines.push(`${k}：已调整`);
    else lines.push(`${k}：${String(v)}`);
  }
  return lines.length ? lines.join('\n') : null;
}

function buildVerificationSummary(ver, row, opts = {}) {
  const lines = [];
  if (!ver) {
    if (opts.includeExtendedAi && row.ai_problems && String(row.ai_problems).trim()) {
      lines.push(`问题分析：${String(row.ai_problems).slice(0, 800)}`);
    }
    if (opts.includeExtendedAi && row.ai_suggestions && String(row.ai_suggestions).trim()) {
      lines.push(`改进建议：${String(row.ai_suggestions).slice(0, 800)}`);
    }
    return lines.length ? lines.join('\n\n') : '暂无智能核查记录。';
  }

  if (ver.requirementComparison) lines.push(`与任务要求对比：\n${ver.requirementComparison}`);
  if (ver.enterpriseAlignment) lines.push(`企业/岗位契合：\n${ver.enterpriseAlignment}`);

  const sc = ver.stepCompleteness;
  if (sc) {
    const cov = Array.isArray(sc.covered) ? sc.covered.join('、') : emptyDash(null);
    const mis = Array.isArray(sc.missing) ? sc.missing.join('、') : emptyDash(null);
    lines.push(`步骤覆盖：${cov}`);
    lines.push(`待补充步骤：${mis}`);
    if (sc.score != null) lines.push(`步骤完整性得分：${formatScore(sc.score)}`);
  }

  const issues = Array.isArray(ver.logicIssues) ? ver.logicIssues : [];
  if (issues.length) {
    const issueLines = issues.map((it, i) => {
      if (it == null) return `${i + 1}. —`;
      if (typeof it === 'string') return `${i + 1}. ${it}`;
      const t = it.title || it.summary || '';
      const d = it.detail || it.description || '';
      return `${i + 1}. ${t}${d ? ` — ${d}` : ''}`;
    });
    lines.push(`逻辑与实现注意点：\n${issueLines.join('\n')}`);
  }

  if (ver.summary) lines.push(`核查摘要：\n${ver.summary}`);

  const styleText = formatCodeStyleReview(ver.codeStyleReview);
  if (styleText) lines.push(`规范与可读性：\n${styleText}`);

  if (opts.includeTeacherOverride) {
    const ovText = formatTeacherOverrideSummary(parseTeacherOverride(row.verification_teacher_override));
    if (ovText) lines.push(`教师核查修正：\n${ovText}`);
  }

  return lines.join('\n\n') || '暂无智能核查记录。';
}

function buildAiCommentBlock(row, isStudentView) {
  const parts = [];
  if (row.ai_comment && String(row.ai_comment).trim()) {
    parts.push(String(row.ai_comment).trim());
  }
  if (!isStudentView) {
    if (row.ai_problems && String(row.ai_problems).trim()) {
      parts.push(`【问题分析】\n${String(row.ai_problems).trim()}`);
    }
    if (row.ai_suggestions && String(row.ai_suggestions).trim()) {
      parts.push(`【改进建议】\n${String(row.ai_suggestions).trim()}`);
    }
  }
  return parts.length ? parts.join('\n\n') : null;
}

function compositeScore(row) {
  if (row.final_score != null && row.final_score !== '') return row.final_score;
  if (row.human_score != null && row.human_score !== '') return row.human_score;
  if (row.total_score != null && row.total_score !== '') return row.total_score;
  return null;
}

function weakDimensions(dimArr) {
  const out = [];
  for (const d of dimArr || []) {
    const max = Number(d.maxScore);
    const sc = Number(d.score);
    if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(sc)) continue;
    if (sc / max < 0.55) out.push(d.name || '维度');
  }
  return out;
}

async function loadGradingReportRow(submissionId) {
  const [rows] = await pool.query(
    `
    SELECT
      gr.*,
      s.student_id,
      s.submitted_at,
      s.file_name,
      s.max_similarity,
      s.similarity_level,
      t.id AS task_id,
      t.title AS task_title,
      t.deadline,
      t.max_score AS task_max_score,
      t.scenario_type,
      u.real_name AS student_name,
      u.student_no,
      c.class_name,
      co.course_name,
      tc.class_name AS teaching_class_name,
      tm.name AS term_name,
      tpl.project_name,
      tea.real_name AS publisher_teacher_name,
      ent.real_name AS enterprise_grader_name
    FROM grading_results gr
    JOIN submissions s ON gr.submission_id = s.id
    JOIN tasks t ON s.task_id = t.id
    JOIN users u ON s.student_id = u.id
    LEFT JOIN classes c ON u.class_id = c.id
    LEFT JOIN courses co ON t.course_id = co.id
    LEFT JOIN teaching_classes tc ON t.teaching_class_id = tc.id
    LEFT JOIN terms tm ON tc.term_id = tm.id
    LEFT JOIN training_project_templates tpl ON t.project_template_id = tpl.id
    LEFT JOIN users tea ON t.created_by = tea.id
    LEFT JOIN users ent ON gr.enterprise_graded_by = ent.id
    WHERE gr.submission_id = ?
    `,
    [submissionId]
  );
  return rows.length ? rows[0] : null;
}

function renderPersonalTranscriptPdf(ctx, row, options = {}) {
  const isStudentView = !!options.isStudentView;
  const dim = parseDimensionScores(row.dimension_scores);
  const ver = parseVerification(row.verification_result);
  const attachmentName = normalizeStoredFileNameForDisplay(row.file_name);
  const late = isLateSubmit(row.submitted_at, row.deadline);
  const statusLabel = gradingStatusLabel(row.status, true);

  drawHeader(ctx, {
    mainTitle: '龙芯智训·学生实训成绩单',
    subTitle: '校企协同实训智慧评价平台',
  });

  drawSectionTitle(ctx, '一、任务与班级信息');
  drawKeyValueTable(ctx, [
    { label: '任务名称', value: row.task_title },
    { label: '班级', value: row.class_name },
    { label: '课程', value: row.course_name },
    { label: '教学班', value: row.teaching_class_name },
    { label: '学期', value: row.term_name },
    { label: '实训项目', value: row.project_name },
  ]);

  drawSectionTitle(ctx, '二、学生与提交信息');
  drawKeyValueTable(ctx, [
    { label: '学生姓名', value: row.student_name },
    { label: '学号', value: row.student_no },
    { label: '提交时间', value: formatDateTime(row.submitted_at) },
    { label: '是否迟交', value: late ? '是' : '否' },
    { label: '批改状态', value: statusLabel },
    { label: '附件文件名', value: attachmentName },
    { label: '任务截止时间', value: formatDateTime(row.deadline) },
    { label: '发布教师', value: row.publisher_teacher_name },
  ]);

  drawSectionTitle(ctx, '三、成绩汇总');
  drawScoreSummary(ctx, [
    { label: 'AI 分', value: formatScore(row.total_score) },
    { label: '教师分', value: formatScore(row.human_score) },
    { label: '企业导师评分', value: formatScore(row.enterprise_score) },
    { label: '综合分', value: formatScore(compositeScore(row)) },
  ]);

  drawSectionTitle(ctx, '四、维度得分明细');
  if (dim.length) {
    drawSimpleTable(ctx, {
      headers: ['维度名称', '得分', '满分', '达成率'],
      colWidths: [CONTENT_W * 0.36, CONTENT_W * 0.18, CONTENT_W * 0.18, CONTENT_W * 0.28],
      rows: dim.map((d) => {
        const sc = Number(d.score);
        const max = Number(d.maxScore);
        let rate = '—';
        if (Number.isFinite(sc) && Number.isFinite(max) && max > 0) {
          rate = `${((sc / max) * 100).toFixed(1)}%`;
        }
        return [
          emptyDash(d.name || '维度'),
          formatScore(d.score),
          formatScore(d.maxScore),
          rate,
        ];
      }),
    });
    const weak = weakDimensions(dim);
    if (weak.length) {
      drawTextBox(ctx, `相对薄弱维度：${weak.join('、')}`, { minHeight: 36, fontSize: 9 });
    }
  } else {
    drawTextBox(ctx, '暂无维度得分记录。', { minHeight: 36, fontSize: 9 });
  }

  drawSectionTitle(ctx, '五、智能核查与查重');
  const similarityBlock = [
    `最高相似度：${formatSimilarityPercent(row.max_similarity)}`,
    `查重等级：${similarityLevelLabel(row.similarity_level)}`,
  ].join('\n');
  const verificationText = buildVerificationSummary(ver, row, {
    includeTeacherOverride: !isStudentView,
    includeExtendedAi: !isStudentView,
  });
  drawTextBox(ctx, `${similarityBlock}\n\n${verificationText}`, { minHeight: 88, fontSize: 9 });

  drawSectionTitle(ctx, '六、AI 评语');
  drawTextBox(ctx, buildAiCommentBlock(row, isStudentView), { minHeight: 64, fontSize: 9 });

  drawSectionTitle(ctx, '七、教师复核意见');
  drawTextBox(ctx, row.human_comment, { minHeight: 64, fontSize: 9 });

  drawSectionTitle(ctx, '八、企业导师评价');
  drawKeyValueTable(ctx, [
    { label: '企业导师评分', value: formatScore(row.enterprise_score) },
    { label: '企业导师署名', value: row.enterprise_grader_name },
  ]);
  drawTextBox(ctx, row.enterprise_comment, { minHeight: 56, fontSize: 9 });

  drawSectionTitle(ctx, '九、签名确认');
  addSignatureArea(ctx);
}

async function exportPersonalPdf(req, res) {
  try {
    const { submissionId } = req.params;
    const row = await loadGradingReportRow(submissionId);

    if (!row) {
      return res.status(404).json({ success: false, message: '记录不存在' });
    }

    if (req.user.role === 'student' && row.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: '无权导出' });
    }
    if (req.user.role === 'teacher') {
      const ok = await teacherOwnsSubmissionTask(req.user.id, submissionId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权导出' });
      }
    }

    const isStudentView = req.user.role === 'student';

    const filename = isStudentView
      ? `个人实训报告_${safeFilenamePart(row.student_name)}_${submissionId}.pdf`
      : `实训成绩单_${safeFilenamePart(row.class_name || '班级')}_${safeFilenamePart(row.student_name)}_${submissionId}.pdf`;

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
      bufferPages: true,
    });

    const fontReg = registerChineseFont(doc);
    if (!fontReg.fontPath) {
      return res.status(503).json({
        success: false,
        message: fontReg.error,
      });
    }

    res.setHeader('Content-Type', 'application/pdf; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    doc.pipe(res);

    const ctx = createLayoutContext(doc, fontReg.fontPath, { exportTime: new Date() });
    renderPersonalTranscriptPdf(ctx, row, { isStudentView });
    drawFootersOnAllPages(ctx);

    if (req.user.role !== 'student') {
      const scopeLabel = [row.class_name, row.student_name, row.task_title].filter(Boolean).join(' · ');
      recordExportLog({
        userId: req.user.id,
        exportType: 'personal_pdf',
        format: 'pdf',
        scopeLabel,
        taskId: row.task_id || null,
        scopeType: row.teaching_class_name ? 'teaching_class' : row.class_name ? 'legacy_class' : null,
        scopeId: null,
        fileName: filename,
        rowCount: 1,
      });
    }

    doc.end();
  } catch (error) {
    console.error('exportPersonalPdf', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: '导出 PDF 失败', error: error.message });
    }
  }
}

async function exportClassPdf(req, res) {
  try {
    req.query = {
      ...req.query,
      scopeType: 'legacy_class',
      scopeId: req.params.classId,
      classId: req.params.classId,
    };
    return exportPracticePdf(req, res);
  } catch (error) {
    console.error('exportClassPdf', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: '导出班级 PDF 失败', error: error.message });
    }
  }
}

async function exportPracticePdf(req, res) {
  try {
    const scope = await resolvePracticeScope(req);
    if (!scope.ok) {
      return res.status(scope.status).json({ success: false, message: scope.message });
    }

    const pdfMeta = await resolvePracticePdfMeta(scope);
    if (!pdfMeta.ok) {
      return res.status(pdfMeta.status).json({ success: false, message: pdfMeta.message });
    }

    const rows = await fetchPracticeSummaryRows(scope);
    const exportMeta = await buildPracticeSummaryPdfMeta(scope, req.user);

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      bufferPages: true,
    });

    const fontReg = registerChineseFont(doc);
    if (!fontReg.fontPath) {
      return res.status(503).json({ success: false, message: fontReg.error });
    }

    res.setHeader('Content-Type', 'application/pdf; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(pdfMeta.filename)}`
    );

    doc.pipe(res);

    const ctx = createLayoutContext(doc, fontReg.fontPath, { exportTime: new Date() });
    renderPracticeSummaryPdf(ctx, rows, {
      ...exportMeta,
      mainTitle: pdfMeta.mainTitle,
      subTitle: pdfMeta.subTitle,
    });
    drawFootersOnAllPages(ctx);

    recordExportLog({
      userId: req.user.id,
      exportType: 'practice_scores_pdf',
      format: 'pdf',
      scopeLabel: exportMeta.scopeLabel,
      taskId: scope.taskId || null,
      scopeType: scope.type,
      scopeId: scope.scopeId,
      fileName: pdfMeta.filename,
      rowCount: rows.length,
    });

    doc.end();
  } catch (error) {
    console.error('exportPracticePdf', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: '导出实训 PDF 失败', error: error.message });
    }
  }
}

module.exports = {
  exportPersonalPdf,
  exportClassPdf,
  exportPracticePdf,
  loadGradingReportRow,
  renderPersonalTranscriptPdf,
};
