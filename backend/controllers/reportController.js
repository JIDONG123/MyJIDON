const PDFDocument = require('pdfkit');
const pool = require('../config/database');
const { teacherOwnsSubmissionTask, teacherManagesClass } = require('../utils/accessControl');
const { normalizeStoredFileNameForDisplay } = require('../utils/filenameEncoding');
const { pickCjkFont } = require('../utils/pdfChineseFont');

const PT_A4_W = 595.28;
const MARGIN = 48;
const CONTENT_W = PT_A4_W - MARGIN * 2;

function safeFilenamePart(s) {
  return String(s ?? '')
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72);
}

function fmtZh(dt) {
  if (!dt) return '—';
  try {
    const d = dt instanceof Date ? dt : new Date(dt);
    if (Number.isNaN(d.getTime())) return String(dt);
    return d.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return String(dt);
  }
}

function statusZh(st) {
  const m = {
    pending: '待批改',
    ai_graded: 'AI 已批改',
    human_graded: '人工已复核',
  };
  return m[st] || st || '—';
}

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

function isLateSubmit(submittedAt, deadline) {
  if (!submittedAt || !deadline) return false;
  try {
    return new Date(submittedAt).getTime() > new Date(deadline).getTime();
  } catch {
    return false;
  }
}

function logicIssueLine(it, i) {
  if (it == null) return `${i + 1}. —`;
  if (typeof it === 'string') return `${i + 1}. ${it}`;
  const t = it.title || it.summary || '';
  const d = it.detail || it.description || '';
  return `${i + 1}. ${t}${d ? ` — ${d}` : ''}`;
}

/** @param {PDFKit.PDFDocument} doc */
function applyBodyFont(doc, fontPath, size = 10, color = '#1e293b') {
  doc.font(fontPath).fontSize(size).fillColor(color);
}

/** @param {PDFKit.PDFDocument} doc */
function sectionTitle(doc, fontPath, title) {
  doc.moveDown(0.55);
  applyBodyFont(doc, fontPath, 12, '#0b3d6d');
  doc.text(title, { width: CONTENT_W });
  doc.moveDown(0.2);
  const y = doc.y;
  doc.save();
  doc.strokeColor('#94a3b8').lineWidth(0.6).moveTo(MARGIN, y).lineTo(PT_A4_W - MARGIN, y).stroke();
  doc.restore();
  doc.moveDown(0.45);
  applyBodyFont(doc, fontPath, 10, '#1e293b');
}

/** @param {PDFKit.PDFDocument} doc */
function blockLabelValue(doc, fontPath, label, value, opts = {}) {
  const v = value == null || value === '' ? '—' : String(value);
  const size = opts.size || 10;
  applyBodyFont(doc, fontPath, size, '#1e293b');
  doc.text(`${label}：${v}`, { width: CONTENT_W, align: 'left' });
  doc.moveDown(0.35);
}

/** @param {PDFKit.PDFDocument} doc */
function paragraph(doc, fontPath, text, size = 10) {
  const t = text == null || String(text).trim() === '' ? '—' : String(text);
  applyBodyFont(doc, fontPath, size, '#334155');
  doc.text(t, { width: CONTENT_W, align: 'left' });
  doc.moveDown(0.45);
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

function buildStudentLearningSummary(row, dimArr, ver) {
  const chunks = [];
  if (ver?.summary) chunks.push(`智能核查摘要：${String(ver.summary).slice(0, 600)}`);
  if (row.ai_suggestions) chunks.push(`改进建议：${String(row.ai_suggestions).slice(0, 600)}`);
  const wd = weakDimensions(dimArr);
  if (wd.length) chunks.push(`相对薄弱维度：${wd.join('、')}`);
  if (row.ai_problems && String(row.ai_problems).trim())
    chunks.push(`问题分析：${String(row.ai_problems).slice(0, 500)}`);
  return chunks.filter(Boolean).join('\n\n') || '（系统未生成额外学情小结，请以教师评语与智能核查为准。）';
}

function buildTeacherLearningAnalysis(row, dimArr, ver) {
  const chunks = [];
  chunks.push(buildStudentLearningSummary(row, dimArr, ver));
  if (row.verification_teacher_override) {
    const o = parseTeacherOverride(row.verification_teacher_override);
    if (o && Object.keys(o).length) {
      chunks.push(`教师核查修正（结构化记录）：\n${JSON.stringify(o, null, 2).slice(0, 1200)}`);
    }
  }
  return chunks.join('\n\n');
}

function drawCoverTitle(doc, fontPath, mainTitle, subTitle) {
  doc.y = MARGIN + 8;
  applyBodyFont(doc, fontPath, 20, '#0b3d6d');
  doc.text(mainTitle, { align: 'center', width: CONTENT_W });
  doc.moveDown(0.35);
  applyBodyFont(doc, fontPath, 11, '#64748b');
  doc.text(subTitle, { align: 'center', width: CONTENT_W });
  doc.moveDown(1.2);
  applyBodyFont(doc, fontPath, 10, '#1e293b');
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
      tea.real_name AS publisher_teacher_name,
      ent.real_name AS enterprise_grader_name
    FROM grading_results gr
    JOIN submissions s ON gr.submission_id = s.id
    JOIN tasks t ON s.task_id = t.id
    JOIN users u ON s.student_id = u.id
    LEFT JOIN classes c ON u.class_id = c.id
    LEFT JOIN users tea ON t.created_by = tea.id
    LEFT JOIN users ent ON gr.enterprise_graded_by = ent.id
    WHERE gr.submission_id = ?
    `,
    [submissionId]
  );
  return rows.length ? rows[0] : null;
}

function similarityLevelZh(level) {
  const m = { none: '无', low: '低', warn: '预警', high: '疑似抄袭' };
  return m[level] || level || '—';
}

/**
 * @param {PDFKit.PDFDocument} doc
 */
function renderStudentPersonalPdf(doc, row, fontPath) {
  const dim = parseDimensionScores(row.dimension_scores);
  const ver = parseVerification(row.verification_result);
  const attachmentName = normalizeStoredFileNameForDisplay(row.file_name) || '—';

  drawCoverTitle(doc, fontPath, '个人实训成绩报告单', '（学生本人存档 · 不含他人数据）');

  sectionTitle(doc, fontPath, '一、基本信息');
  blockLabelValue(doc, fontPath, '姓名', row.student_name);
  blockLabelValue(doc, fontPath, '班级', row.class_name);
  blockLabelValue(doc, fontPath, '学号', row.student_no);
  blockLabelValue(doc, fontPath, '任务名称', row.task_title);
  blockLabelValue(doc, fontPath, '发布教师', row.publisher_teacher_name);
  blockLabelValue(doc, fontPath, '截止时间', fmtZh(row.deadline));
  blockLabelValue(doc, fontPath, '提交时间', fmtZh(row.submitted_at));
  blockLabelValue(doc, fontPath, '提交附件', attachmentName);

  sectionTitle(doc, fontPath, '二、成绩概览');
  blockLabelValue(doc, fontPath, 'AI 评分', row.total_score != null ? row.total_score : '—');
  blockLabelValue(doc, fontPath, '教师评分', row.human_score != null ? row.human_score : '—');
  if (row.enterprise_score != null || (row.enterprise_comment && String(row.enterprise_comment).trim())) {
    blockLabelValue(doc, fontPath, '企业导师评分', row.enterprise_score != null ? row.enterprise_score : '—');
  }
  blockLabelValue(
    doc,
    fontPath,
    '最终得分',
    row.final_score != null ? row.final_score : row.total_score ?? '—'
  );

  if (dim.length) {
    sectionTitle(doc, fontPath, '三、维度得分');
    dim.forEach((d) => {
      paragraph(
        doc,
        fontPath,
        `· ${d.name || '维度'}：${d.score != null ? d.score : '—'} / ${d.maxScore != null ? d.maxScore : '—'}`,
        10
      );
    });
  }

  doc.addPage();
  applyBodyFont(doc, fontPath, 10, '#1e293b');
  sectionTitle(doc, fontPath, '四、评语');
  paragraph(doc, fontPath, `【教师评语】\n${row.human_comment || '—'}`, 10);
  paragraph(doc, fontPath, `【AI 综合评语】\n${row.ai_comment || '—'}`, 10);
  if (row.enterprise_comment && String(row.enterprise_comment).trim()) {
    paragraph(doc, fontPath, `【企业导师评语】\n${row.enterprise_comment}`, 10);
  }

  sectionTitle(doc, fontPath, '五、实训步骤与智能核查');
  if (ver) {
    if (ver.requirementComparison)
      paragraph(doc, fontPath, `与任务要求对比：\n${ver.requirementComparison}`, 10);
    if (ver.enterpriseAlignment)
      paragraph(doc, fontPath, `企业/岗位契合（如有）：\n${ver.enterpriseAlignment}`, 10);
    const sc = ver.stepCompleteness;
    if (sc) {
      const cov = Array.isArray(sc.covered) ? sc.covered.join('、') : '—';
      const mis = Array.isArray(sc.missing) ? sc.missing.join('、') : '—';
      paragraph(doc, fontPath, `步骤覆盖：${cov}`, 10);
      paragraph(doc, fontPath, `待补充：${mis}`, 10);
      if (sc.score != null) paragraph(doc, fontPath, `步骤相关得分（0–100）：${sc.score}`, 10);
    }
    const issues = Array.isArray(ver.logicIssues) ? ver.logicIssues : [];
    if (issues.length) {
      applyBodyFont(doc, fontPath, 10, '#334155');
      doc.text('逻辑与实现注意点：', { width: CONTENT_W });
      doc.moveDown(0.2);
      issues.forEach((it, i) => paragraph(doc, fontPath, logicIssueLine(it, i), 9));
    }
    if (ver.summary) paragraph(doc, fontPath, `核查摘要：\n${ver.summary}`, 10);
    if (ver.codeStyleReview) {
      paragraph(
        doc,
        fontPath,
        `规范与可读性：\n${typeof ver.codeStyleReview === 'string' ? ver.codeStyleReview : JSON.stringify(ver.codeStyleReview, null, 2)}`,
        9
      );
    }
  } else {
    paragraph(doc, fontPath, '（本期暂无智能核查记录）', 10);
  }

  sectionTitle(doc, fontPath, '六、个人学情小结');
  paragraph(doc, fontPath, buildStudentLearningSummary(row, dim, ver), 10);

  doc.moveDown(0.8);
  applyBodyFont(doc, fontPath, 8.5, '#94a3b8');
  doc.text(`生成时间：${fmtZh(new Date())}`, { width: CONTENT_W, align: 'right' });
}

/**
 * @param {PDFKit.PDFDocument} doc
 */
function renderTeacherTranscriptPdf(doc, row, fontPath) {
  const dim = parseDimensionScores(row.dimension_scores);
  const ver = parseVerification(row.verification_result);
  const attachmentName = normalizeStoredFileNameForDisplay(row.file_name) || '—';
  const late = isLateSubmit(row.submitted_at, row.deadline);

  drawCoverTitle(doc, fontPath, '学生实训成绩单（单人）', '（教师/教务归档 · 含管理字段）');

  sectionTitle(doc, fontPath, '一、任务与班级');
  blockLabelValue(doc, fontPath, '班级', row.class_name);
  blockLabelValue(doc, fontPath, '任务名称', row.task_title);
  blockLabelValue(doc, fontPath, '任务场景', row.scenario_type || '—');
  blockLabelValue(doc, fontPath, '导出时间', fmtZh(new Date()));

  sectionTitle(doc, fontPath, '二、学生与提交');
  blockLabelValue(doc, fontPath, '姓名', row.student_name);
  blockLabelValue(doc, fontPath, '学号', row.student_no);
  blockLabelValue(doc, fontPath, '提交时间', fmtZh(row.submitted_at));
  blockLabelValue(doc, fontPath, '迟交', late ? '是' : '否');
  blockLabelValue(doc, fontPath, '批改状态', statusZh(row.status));
  blockLabelValue(doc, fontPath, '附件文件名', attachmentName);

  sectionTitle(doc, fontPath, '三、查重（管理参考）');
  blockLabelValue(
    doc,
    fontPath,
    '最高相似度',
    row.max_similarity != null ? `${Number(row.max_similarity).toFixed(1)}%` : '—'
  );
  blockLabelValue(doc, fontPath, '等级', similarityLevelZh(row.similarity_level));

  sectionTitle(doc, fontPath, '四、成绩详情');
  blockLabelValue(doc, fontPath, 'AI 评分', row.total_score != null ? row.total_score : '—');
  blockLabelValue(doc, fontPath, '教师评分', row.human_score != null ? row.human_score : '—');
  blockLabelValue(doc, fontPath, '企业导师评分', row.enterprise_score != null ? row.enterprise_score : '—');
  blockLabelValue(
    doc,
    fontPath,
    '最终得分',
    row.final_score != null ? row.final_score : row.total_score ?? '—'
  );
  if (row.enterprise_grader_name) {
    blockLabelValue(doc, fontPath, '企业导师署名', row.enterprise_grader_name);
  }

  if (dim.length) {
    sectionTitle(doc, fontPath, '五、维度得分明细');
    dim.forEach((d) => {
      paragraph(
        doc,
        fontPath,
        `· ${d.name || '维度'}：${d.score != null ? d.score : '—'} / ${d.maxScore != null ? d.maxScore : '—'}`,
        10
      );
    });
  }

  doc.addPage();
  applyBodyFont(doc, fontPath, 10, '#1e293b');
  sectionTitle(doc, fontPath, '六、评语（完整）');
  paragraph(doc, fontPath, `【教师评语】\n${row.human_comment || '—'}`, 10);
  paragraph(doc, fontPath, `【AI 评语】\n${row.ai_comment || '—'}`, 10);
  paragraph(doc, fontPath, `【AI 问题分析】\n${row.ai_problems || '—'}`, 10);
  paragraph(doc, fontPath, `【AI 改进建议】\n${row.ai_suggestions || '—'}`, 10);
  paragraph(doc, fontPath, `【企业导师评语】\n${row.enterprise_comment || '—'}`, 10);

  sectionTitle(doc, fontPath, '七、智能核查报告');
  if (ver) {
    if (ver.requirementComparison)
      paragraph(doc, fontPath, `与任务要求对比：\n${ver.requirementComparison}`, 10);
    if (ver.enterpriseAlignment)
      paragraph(doc, fontPath, `企业/岗位契合：\n${ver.enterpriseAlignment}`, 10);
    const sc = ver.stepCompleteness;
    if (sc) {
      paragraph(doc, fontPath, `步骤覆盖：${Array.isArray(sc.covered) ? sc.covered.join('、') : '—'}`, 10);
      paragraph(doc, fontPath, `缺失步骤：${Array.isArray(sc.missing) ? sc.missing.join('、') : '—'}`, 10);
      if (sc.score != null) paragraph(doc, fontPath, `步骤得分（0–100）：${sc.score}`, 10);
    }
    const issues = Array.isArray(ver.logicIssues) ? ver.logicIssues : [];
    if (issues.length) {
      applyBodyFont(doc, fontPath, 10, '#334155');
      doc.text('逻辑与实现问题：', { width: CONTENT_W });
      doc.moveDown(0.2);
      issues.forEach((it, i) => paragraph(doc, fontPath, logicIssueLine(it, i), 9));
    }
    if (ver.summary) paragraph(doc, fontPath, `摘要：\n${ver.summary}`, 10);
    if (ver.codeStyleReview) {
      paragraph(
        doc,
        fontPath,
        `规范与可读性：\n${typeof ver.codeStyleReview === 'string' ? ver.codeStyleReview : JSON.stringify(ver.codeStyleReview, null, 2)}`,
        9
      );
    }
  } else {
    paragraph(doc, fontPath, '（无智能核查 JSON 记录）', 10);
  }

  const ov = parseTeacherOverride(row.verification_teacher_override);
  if (ov && Object.keys(ov).length) {
    sectionTitle(doc, fontPath, '八、教师核查修正（原始记录）');
    paragraph(doc, fontPath, JSON.stringify(ov, null, 2), 8.5);
  }

  sectionTitle(doc, fontPath, ov && Object.keys(ov).length ? '九、学情分析（单次任务）' : '八、学情分析（单次任务）');
  paragraph(doc, fontPath, buildTeacherLearningAnalysis(row, dim, ver), 10);

  doc.moveDown(0.8);
  applyBodyFont(doc, fontPath, 8.5, '#94a3b8');
  doc.text(`生成时间：${fmtZh(new Date())}`, { width: CONTENT_W, align: 'right' });
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

    const fontPath = pickCjkFont();
    if (!fontPath) {
      return res.status(503).json({
        success: false,
        message:
          '服务器未找到可用的中文字体文件。请在服务器安装 Noto CJK / 文泉驿等字体，或设置环境变量 PDF_CJK_FONT 指向 .ttf/.otf 绝对路径（Windows 常见：C:\\Windows\\Fonts\\simhei.ttf）。',
      });
    }

    const isStudentView = req.user.role === 'student';

    const filename = isStudentView
      ? `个人实训报告_${safeFilenamePart(row.student_name)}_${submissionId}.pdf`
      : `实训成绩单_${safeFilenamePart(row.class_name || '班级')}_${safeFilenamePart(row.student_name)}_${submissionId}.pdf`;

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
    });

    res.setHeader('Content-Type', 'application/pdf; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    doc.pipe(res);

    doc.font(fontPath);
    if (isStudentView) {
      renderStudentPersonalPdf(doc, row, fontPath);
    } else {
      renderTeacherTranscriptPdf(doc, row, fontPath);
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
    const { classId } = req.params;
    if (req.user.role === 'teacher') {
      const ok = await teacherManagesClass(req.user.id, classId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权导出该班级报表' });
      }
    }
    const [cls] = await pool.query('SELECT class_name FROM classes WHERE id = ?', [classId]);
    if (!cls.length) {
      return res.status(404).json({ success: false, message: '班级不存在' });
    }

    const [rows] = await pool.query(
      `
      SELECT u.real_name AS student_name, t.title AS task_name,
             gr.total_score, gr.human_score, gr.final_score, gr.status, s.submitted_at
      FROM users u
      JOIN submissions s ON u.id = s.student_id
      JOIN tasks t ON s.task_id = t.id
      LEFT JOIN grading_results gr ON s.id = gr.submission_id
      WHERE u.class_id = ? AND u.role = 'student'
      ORDER BY t.title, u.real_name
    `,
      [classId]
    );

    const fontPath = pickCjkFont();
    if (!fontPath) {
      return res.status(503).json({
        success: false,
        message:
          '服务器未找到可用的中文字体文件。请安装中文字体或设置环境变量 PDF_CJK_FONT（可参考个人报告导出说明）。',
      });
    }

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN - 8, left: MARGIN, right: MARGIN },
    });

    const filename = `班级实训统计_${safeFilenamePart(cls[0].class_name)}_${classId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    doc.pipe(res);
    doc.font(fontPath);

    applyBodyFont(doc, fontPath, 16, '#0b3d6d');
    doc.text('班级实训成绩汇总表', { align: 'center', width: CONTENT_W });
    doc.moveDown(0.4);
    applyBodyFont(doc, fontPath, 11, '#475569');
    doc.text(`班级：${cls[0].class_name}`, { align: 'center', width: CONTENT_W });
    doc.moveDown(0.3);
    applyBodyFont(doc, fontPath, 9, '#64748b');
    doc.text(`统计导出时间：${fmtZh(new Date())}`, { align: 'center', width: CONTENT_W });
    doc.moveDown(1);

    sectionTitle(doc, fontPath, '学生×任务成绩明细');
    if (!rows.length) {
      paragraph(doc, fontPath, '（暂无提交与批改记录）', 10);
    } else {
      rows.forEach((r, idx) => {
        const lineScore =
          r.final_score != null ? r.final_score : r.human_score != null ? r.human_score : r.total_score;
        const line = `${idx + 1}. ${r.student_name} ｜ ${r.task_name} ｜ 成绩：${
          lineScore ?? '—'
        } ｜ 状态：${statusZh(r.status)} ｜ 提交：${fmtZh(r.submitted_at)}`;
        applyBodyFont(doc, fontPath, 9, '#334155');
        doc.text(line, { width: CONTENT_W, align: 'left' });
        doc.moveDown(0.35);
      });
    }

    doc.end();
  } catch (error) {
    console.error('exportClassPdf', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: '导出班级 PDF 失败', error: error.message });
    }
  }
}

module.exports = { exportPersonalPdf, exportClassPdf };
