/**
 * 在线实训 API 服务（Phase B+：模板 CRUD + attempt + 复用 codeRunService 入队）
 */
const pool = require('../config/database');
const codeRunService = require('./codeRunService');
const {
  teacherManagesClass,
  teacherManagesTeachingClass,
  getStudentClassId,
  getStudentTeachingClassIds,
} = require('../utils/accessControl');
const { isLanguageSupported } = require('../utils/codeRunLanguageSpec');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseConfigJson(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function parseAiReviewEnabled(body, fallback = 1) {
  if (body?.aiReviewEnabled !== undefined) return body.aiReviewEnabled ? 1 : 0;
  if (body?.ai_review_enabled !== undefined) return body.ai_review_enabled ? 1 : 0;
  return fallback ? 1 : 0;
}

function normalizeTemplateConfig(body, language) {
  const { getEntryFile } = require('../utils/codeRunLanguageSpec');
  const existing = parseConfigJson(body.configJson ?? body.config_json);
  const entryFile =
    String(body.entryFile ?? body.entry_file ?? existing.entry_file ?? getEntryFile(language) ?? 'main.py').trim() ||
    'main.py';
  return JSON.stringify({ entry_file: entryFile });
}

function formatTemplate(row, { hideHint = false } = {}) {
  if (!row) return null;
  const cfg = parseConfigJson(row.config_json);
  const { getEntryFile } = require('../utils/codeRunLanguageSpec');
  const out = {
    id: row.id,
    title: row.title,
    description: row.description,
    language: row.language,
    starterCode: row.starter_code,
    stdinDefault: row.stdin_default,
    teachingClassId: row.teaching_class_id,
    classId: row.class_id,
    taskId: row.task_id,
    codeRunTimeoutSec: row.code_run_timeout_sec,
    configJson: cfg,
    entryFile: cfg.entry_file || getEntryFile(row.language) || null,
    status: row.status,
    createdBy: row.created_by,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    aiReviewEnabled: row.ai_review_enabled == null ? true : Number(row.ai_review_enabled) !== 0,
  };
  if (!hideHint) out.solutionHint = row.solution_hint;
  return out;
}

function formatAttempt(row) {
  if (!row) return null;
  return {
    id: row.id,
    templateId: row.template_id,
    studentId: row.student_id,
    sourceCode: row.source_code,
    lastCodeRunResultId: row.last_code_run_result_id,
    linkedSubmissionId: row.linked_submission_id,
    runCount: row.run_count,
    lastAiReviewId: row.last_ai_review_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getTemplateRow(id) {
  const [rows] = await pool.query('SELECT * FROM online_practice_templates WHERE id = ?', [id]);
  return rows[0] || null;
}

async function getAttemptRow(id) {
  const [rows] = await pool.query('SELECT * FROM online_practice_attempts WHERE id = ?', [id]);
  return rows[0] || null;
}

async function teacherCanManageTemplate(userId, role, template) {
  if (!template) return false;
  if (role === 'admin') return true;
  if (role !== 'teacher') return false;
  if (Number(template.created_by) === Number(userId)) return true;
  if (template.teaching_class_id) {
    return teacherManagesTeachingClass(userId, template.teaching_class_id);
  }
  if (template.class_id) {
    return teacherManagesClass(userId, template.class_id);
  }
  return false;
}

async function studentCanViewPublishedTemplate(studentId, template) {
  if (!template || template.status !== 'published') return false;

  if (template.teaching_class_id) {
    const tcIds = await getStudentTeachingClassIds(studentId);
    if (tcIds.includes(Number(template.teaching_class_id))) return true;
  }

  if (template.class_id) {
    const cid = await getStudentClassId(studentId);
    if (cid != null && Number(template.class_id) === Number(cid)) return true;
  }

  return false;
}

async function assertTeacherCanManage(userId, role, templateId) {
  const row = await getTemplateRow(templateId);
  if (!row) throw httpError(404, '模板不存在');
  const ok = await teacherCanManageTemplate(userId, role, row);
  if (!ok) throw httpError(403, '无权管理该模板');
  return row;
}

async function assertStudentCanViewTemplate(studentId, templateId) {
  const row = await getTemplateRow(templateId);
  if (!row) throw httpError(404, '模板不存在');
  const ok = await studentCanViewPublishedTemplate(studentId, row);
  if (!ok) throw httpError(403, '无权访问该练习');
  return row;
}

async function validateScopeForCreate(userId, role, body) {
  const teachingClassId = toNum(body.teachingClassId ?? body.teaching_class_id);
  const classId = toNum(body.classId ?? body.class_id);
  if (!teachingClassId && !classId) {
    throw httpError(400, 'teachingClassId 与 classId 至少填一项');
  }
  if (role === 'admin') return { teachingClassId, classId };
  if (role !== 'teacher') throw httpError(403, '权限不足');
  if (teachingClassId) {
    const ok = await teacherManagesTeachingClass(userId, teachingClassId);
    if (!ok) throw httpError(403, '无权在该教学班创建模板');
  }
  if (classId) {
    const ok = await teacherManagesClass(userId, classId);
    if (!ok) throw httpError(403, '无权在该行政班创建模板');
  }
  return { teachingClassId, classId };
}

async function listTemplates(query, userId, role) {
  const status = query.status ? String(query.status).trim() : null;

  if (role === 'student') {
    const tcIds = await getStudentTeachingClassIds(userId);
    const classId = await getStudentClassId(userId);
    const where = ["t.status = 'published'"];
    const params = [];
    const scopeParts = [];
    if (tcIds.length) {
      scopeParts.push(`t.teaching_class_id IN (${tcIds.map(() => '?').join(',')})`);
      params.push(...tcIds);
    }
    if (classId != null) {
      scopeParts.push('t.class_id = ?');
      params.push(classId);
    }
    if (!scopeParts.length) {
      return { data: [] };
    }
    where.push(`(${scopeParts.join(' OR ')})`);
    const [rows] = await pool.query(
      `SELECT t.* FROM online_practice_templates t WHERE ${where.join(' AND ')} ORDER BY t.published_at DESC, t.id DESC`,
      params
    );
    return { data: rows.map((r) => formatTemplate(r, { hideHint: true })) };
  }

  let sql = 'SELECT t.* FROM online_practice_templates t WHERE 1=1';
  const params = [];

  if (role === 'teacher') {
    sql += ` AND (
      t.created_by = ?
      OR EXISTS (
        SELECT 1 FROM teaching_class_teachers tct
        WHERE tct.teaching_class_id = t.teaching_class_id AND tct.teacher_id = ?
      )
      OR EXISTS (
        SELECT 1 FROM classes c
        WHERE c.id = t.class_id AND c.teacher_id = ?
      )
    )`;
    params.push(userId, userId, userId);
  }

  if (status) {
    sql += ' AND t.status = ?';
    params.push(status);
  }

  const teachingClassId = toNum(query.teachingClassId ?? query.teaching_class_id);
  if (teachingClassId) {
    sql += ' AND t.teaching_class_id = ?';
    params.push(teachingClassId);
  }

  sql += ' ORDER BY t.updated_at DESC, t.id DESC';
  const [rows] = await pool.query(sql, params);
  return { data: rows.map((r) => formatTemplate(r)) };
}

async function getTemplateDetail(templateId, userId, role) {
  const row = await getTemplateRow(templateId);
  if (!row) throw httpError(404, '模板不存在');

  if (role === 'student') {
    const ok = await studentCanViewPublishedTemplate(userId, row);
    if (!ok) throw httpError(403, '无权访问该练习');
    return formatTemplate(row, { hideHint: true });
  }

  if (role === 'teacher') {
    const ok = await teacherCanManageTemplate(userId, role, row);
    if (!ok) throw httpError(403, '无权查看该模板');
  }

  return formatTemplate(row);
}

async function createTemplate(body, userId, role) {
  const title = String(body.title || '').trim();
  if (!title) throw httpError(400, '标题必填');

  const language = String(body.language || 'python').toLowerCase();
  if (!isLanguageSupported(language)) {
    throw httpError(400, `不支持的运行语言: ${language}`);
  }

  const { teachingClassId, classId } = await validateScopeForCreate(userId, role, body);
  const timeoutSec = Math.min(60, Math.max(2, toNum(body.codeRunTimeoutSec) || 10));
  const configJson = normalizeTemplateConfig(body, language);
  const aiReviewEnabled = parseAiReviewEnabled(body, 1);

  const [ins] = await pool.query(
    `INSERT INTO online_practice_templates
      (title, description, language, starter_code, solution_hint, stdin_default,
       teaching_class_id, class_id, code_run_timeout_sec, ai_review_enabled, config_json, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [
      title.slice(0, 200),
      body.description || null,
      language,
      body.starterCode ?? body.starter_code ?? null,
      body.solutionHint ?? body.solution_hint ?? null,
      body.stdinDefault ?? body.stdin_default ?? null,
      teachingClassId,
      classId,
      timeoutSec,
      aiReviewEnabled,
      configJson,
      userId,
    ]
  );

  const row = await getTemplateRow(ins.insertId);
  return formatTemplate(row);
}

async function updateTemplate(templateId, body, userId, role) {
  const row = await assertTeacherCanManage(userId, role, templateId);
  if (row.status === 'closed') {
    throw httpError(400, '已关闭的模板不可编辑');
  }

  const title = String(body.title || row.title).trim();
  if (!title) throw httpError(400, '标题必填');

  const language = String(body.language || row.language).toLowerCase();
  if (!isLanguageSupported(language)) {
    throw httpError(400, `不支持的运行语言: ${language}`);
  }

  const timeoutSec = Math.min(
    60,
    Math.max(2, toNum(body.codeRunTimeoutSec) ?? row.code_run_timeout_sec)
  );
  const configJson = normalizeTemplateConfig(
    {
      ...body,
      configJson: body.configJson ?? body.config_json ?? row.config_json,
    },
    language
  );

  const aiReviewEnabled =
    body.aiReviewEnabled !== undefined || body.ai_review_enabled !== undefined
      ? parseAiReviewEnabled(body, 1)
      : row.ai_review_enabled == null
        ? 1
        : Number(row.ai_review_enabled);

  await pool.query(
    `UPDATE online_practice_templates SET
       title = ?, description = ?, language = ?, starter_code = ?, solution_hint = ?,
       stdin_default = ?, code_run_timeout_sec = ?, ai_review_enabled = ?, config_json = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      title.slice(0, 200),
      body.description !== undefined ? body.description : row.description,
      language,
      body.starterCode !== undefined ? body.starterCode : row.starter_code,
      body.solutionHint !== undefined ? body.solutionHint : row.solution_hint,
      body.stdinDefault !== undefined ? body.stdinDefault : row.stdin_default,
      timeoutSec,
      aiReviewEnabled,
      configJson,
      templateId,
    ]
  );

  return formatTemplate(await getTemplateRow(templateId));
}

async function publishTemplate(templateId, userId, role) {
  const row = await assertTeacherCanManage(userId, role, templateId);
  if (row.status === 'published') {
    return formatTemplate(row);
  }
  if (row.status === 'closed') {
    throw httpError(400, '已关闭的模板请复制后重新发布');
  }
  await pool.query(
    `UPDATE online_practice_templates SET status = 'published', published_at = NOW() WHERE id = ?`,
    [templateId]
  );
  return formatTemplate(await getTemplateRow(templateId));
}

async function closeTemplate(templateId, userId, role) {
  await assertTeacherCanManage(userId, role, templateId);
  await pool.query(
    `UPDATE online_practice_templates SET status = 'closed' WHERE id = ?`,
    [templateId]
  );
  return formatTemplate(await getTemplateRow(templateId));
}

async function ensureAttempt(templateId, studentId) {
  const template = await assertStudentCanViewTemplate(studentId, templateId);

  const [existing] = await pool.query(
    'SELECT * FROM online_practice_attempts WHERE template_id = ? AND student_id = ?',
    [templateId, studentId]
  );
  if (existing.length) {
    return { template: formatTemplate(template, { hideHint: true }), attempt: formatAttempt(existing[0]) };
  }

  const [ins] = await pool.query(
    `INSERT INTO online_practice_attempts (template_id, student_id, source_code)
     VALUES (?, ?, ?)`,
    [templateId, studentId, template.starter_code || '']
  );
  const attempt = await getAttemptRow(ins.insertId);
  return { template: formatTemplate(template, { hideHint: true }), attempt: formatAttempt(attempt) };
}

async function listMyAttempts(studentId) {
  const [rows] = await pool.query(
    `SELECT a.*, t.title AS template_title, t.status AS template_status, t.language
     FROM online_practice_attempts a
     INNER JOIN online_practice_templates t ON t.id = a.template_id
     WHERE a.student_id = ?
     ORDER BY a.updated_at DESC`,
    [studentId]
  );
  return {
    data: rows.map((r) => ({
      ...formatAttempt(r),
      templateTitle: r.template_title,
      templateStatus: r.template_status,
      language: r.language,
    })),
  };
}

async function getAttemptDetail(attemptId, studentId) {
  const attempt = await getAttemptRow(attemptId);
  if (!attempt) throw httpError(404, '练习实例不存在');
  if (Number(attempt.student_id) !== Number(studentId)) {
    throw httpError(403, '无权访问该练习实例');
  }
  const template = await getTemplateRow(attempt.template_id);
  if (!template || template.status !== 'published') {
    throw httpError(403, '练习不可用');
  }
  const ok = await studentCanViewPublishedTemplate(studentId, template);
  if (!ok) throw httpError(403, '无权访问该练习实例');
  return {
    attempt: formatAttempt(attempt),
    template: formatTemplate(template, { hideHint: true }),
  };
}

async function saveAttemptSource(attemptId, studentId, sourceCode) {
  const attempt = await getAttemptRow(attemptId);
  if (!attempt) throw httpError(404, '练习实例不存在');
  if (Number(attempt.student_id) !== Number(studentId)) {
    throw httpError(403, '无权访问该练习实例');
  }
  const template = await getTemplateRow(attempt.template_id);
  if (!template || template.status !== 'published') {
    throw httpError(400, '练习未发布或已关闭');
  }
  await pool.query(
    'UPDATE online_practice_attempts SET source_code = ?, updated_at = NOW() WHERE id = ?',
    [String(sourceCode ?? ''), attemptId]
  );
  return formatAttempt(await getAttemptRow(attemptId));
}

async function runAttempt(attemptId, studentId, body) {
  const attempt = await getAttemptRow(attemptId);
  if (!attempt) throw httpError(404, '练习实例不存在');
  if (Number(attempt.student_id) !== Number(studentId)) {
    throw httpError(403, '无权访问该练习实例');
  }

  const template = await getTemplateRow(attempt.template_id);
  if (!template || template.status !== 'published') {
    throw httpError(400, '练习未发布或已关闭');
  }
  const ok = await studentCanViewPublishedTemplate(studentId, template);
  if (!ok) throw httpError(403, '无权运行该练习');

  let sourceCode = attempt.source_code;
  if (body?.sourceCode != null) {
    await saveAttemptSource(attemptId, studentId, body.sourceCode);
    sourceCode = body.sourceCode;
  }

  const runPayload = await codeRunService.createJobFromBody(
    {
      language: template.language,
      sourceCode: sourceCode || template.starter_code || '',
      stdin: template.stdin_default,
      timeoutSec: template.code_run_timeout_sec,
      practiceAttemptId: attemptId,
    },
    studentId,
    'student'
  );

  await pool.query(
    'UPDATE online_practice_attempts SET run_count = run_count + 1, updated_at = NOW() WHERE id = ?',
    [attemptId]
  );

  return runPayload;
}

module.exports = {
  listTemplates,
  getTemplateDetail,
  createTemplate,
  updateTemplate,
  publishTemplate,
  closeTemplate,
  ensureAttempt,
  listMyAttempts,
  getAttemptDetail,
  saveAttemptSource,
  runAttempt,
  teacherCanManageTemplate,
  studentCanViewPublishedTemplate,
};
