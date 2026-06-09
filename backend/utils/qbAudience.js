const pool = require('../config/database');
const {
  teacherManagesClass,
  teacherManagesTeachingClass,
  getStudentClassId,
  getStudentTeachingClassIds,
} = require('./accessControl');

function toInt(v) {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function resolveTeacherListAudience(req) {
  const teachingClassId = toInt(req.query.teachingClassId || req.query.teaching_class_id);
  const classId = toInt(req.query.classId || req.query.class_id);
  if (teachingClassId) {
    if (!(await teacherManagesTeachingClass(req.user.id, teachingClassId))) {
      return { ok: false, status: 403, message: '无权管理该教学班' };
    }
    return { ok: true, classId: null, teachingClassId, scope: 'teaching' };
  }
  if (classId) {
    if (!(await teacherManagesClass(req.user.id, classId))) {
      return { ok: false, status: 403, message: '无权管理该班级' };
    }
    return { ok: true, classId, teachingClassId: null, scope: 'legacy' };
  }
  return { ok: false, status: 400, message: '缺少 classId 或 teachingClassId' };
}

async function resolveTeacherCreateAudience(req) {
  const teachingClassId = toInt(req.body?.teachingClassId || req.body?.teaching_class_id);
  const classId = toInt(req.body?.classId || req.body?.class_id);
  if (teachingClassId && classId) {
    return { ok: false, status: 400, message: 'classId 与 teachingClassId 不可同时指定' };
  }
  if (teachingClassId) {
    if (!(await teacherManagesTeachingClass(req.user.id, teachingClassId))) {
      return { ok: false, status: 403, message: '无权管理该教学班' };
    }
    return { ok: true, classId: null, teachingClassId, scope: 'teaching' };
  }
  if (classId) {
    if (!(await teacherManagesClass(req.user.id, classId))) {
      return { ok: false, status: 403, message: '无权管理该班级' };
    }
    return { ok: true, classId, teachingClassId: null, scope: 'legacy' };
  }
  return { ok: false, status: 400, message: '请指定 classId 或 teachingClassId' };
}

function teacherListWhere(alias, audience) {
  if (audience.scope === 'teaching') {
    return {
      clause: `${alias}.teaching_class_id = ? AND ${alias}.class_id IS NULL`,
      params: [audience.teachingClassId],
    };
  }
  return {
    clause: `${alias}.class_id = ? AND ${alias}.teaching_class_id IS NULL`,
    params: [audience.classId],
  };
}

async function studentAudienceContext(studentId) {
  const classId = await getStudentClassId(studentId);
  const tcIds = await getStudentTeachingClassIds(studentId);
  return { classId, tcIds: tcIds || [] };
}

function studentVisibilityWhere(alias, ctx) {
  const parts = [];
  const params = [];
  if (ctx.classId != null) {
    parts.push(`(${alias}.class_id = ? AND ${alias}.teaching_class_id IS NULL)`);
    params.push(ctx.classId);
  }
  if (ctx.tcIds?.length) {
    parts.push(`${alias}.teaching_class_id IN (${ctx.tcIds.map(() => '?').join(',')})`);
    params.push(...ctx.tcIds);
  }
  if (!parts.length) return { clause: '0', params: [] };
  return { clause: `(${parts.join(' OR ')})`, params };
}

async function getPublishedExamForStudent(examId, studentId) {
  const ctx = await studentAudienceContext(studentId);
  const vis = studentVisibilityWhere('e', ctx);
  const [rows] = await pool.query(
    `SELECT * FROM qb_exams e WHERE e.id = ? AND e.status = 'published' AND ${vis.clause} LIMIT 1`,
    [examId, ...vis.params],
  );
  return rows[0] || null;
}

async function getPublishedPracticeForStudent(practiceId, studentId) {
  const ctx = await studentAudienceContext(studentId);
  const vis = studentVisibilityWhere('p', ctx);
  const [rows] = await pool.query(
    `SELECT * FROM qb_practices p WHERE p.id = ? AND p.status = 'published' AND ${vis.clause} LIMIT 1`,
    [practiceId, ...vis.params],
  );
  return rows[0] || null;
}

async function emitQbExamAudience(examRow, examId, action, extra = {}) {
  const rt = require('./realtimeEmit');
  if (!examRow) return;
  if (examRow.teaching_class_id) {
    await rt.emitTeachingClassQb(examRow.teaching_class_id, {
      domain: 'qb_exams',
      action: action || 'mutate',
      teachingClassId: Number(examRow.teaching_class_id),
      examId: Number(examId),
      ts: Date.now(),
      ...extra,
    });
  } else if (examRow.class_id) {
    rt.emitExam(examRow.class_id, examId, action, extra);
  }
}

async function emitQbPracticeAudience(practiceRow, practiceId, action, extra = {}) {
  const rt = require('./realtimeEmit');
  if (!practiceRow) return;
  if (practiceRow.teaching_class_id) {
    await rt.emitTeachingClassQb(practiceRow.teaching_class_id, {
      domain: 'qb_practices',
      action: action || 'mutate',
      teachingClassId: Number(practiceRow.teaching_class_id),
      practiceId: Number(practiceId),
      ts: Date.now(),
      ...extra,
    });
  } else if (practiceRow.class_id) {
    rt.emitPractice(practiceRow.class_id, practiceId, action, extra);
  }
}

module.exports = {
  toInt,
  resolveTeacherListAudience,
  resolveTeacherCreateAudience,
  teacherListWhere,
  studentAudienceContext,
  studentVisibilityWhere,
  getPublishedExamForStudent,
  getPublishedPracticeForStudent,
  emitQbExamAudience,
  emitQbPracticeAudience,
};
