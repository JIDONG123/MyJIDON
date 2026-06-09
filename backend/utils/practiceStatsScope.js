const pool = require('../config/database');
const {
  teacherManagesClass,
  teacherManagesTeachingClass,
  teacherLeadsCourse,
} = require('./accessControl');

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 解析教师端统计/导出范围。
 * scopeType: legacy_class | teaching_class | course
 */
async function resolvePracticeScope(req) {
  const scopeType = String(req.query.scopeType || req.query.scope_type || '').trim();
  const classId = toNum(req.query.classId || req.params.classId);
  const teachingClassId = toNum(req.query.teachingClassId || req.query.teaching_class_id);
  const courseId = toNum(req.query.courseId || req.query.course_id);
  const termId = toNum(req.query.termId || req.query.term_id);
  const taskId = toNum(req.query.taskId || req.query.task_id);

  let type = scopeType;
  let scopeId = null;

  if (!type) {
    if (classId) {
      type = 'legacy_class';
      scopeId = classId;
    } else if (teachingClassId) {
      type = 'teaching_class';
      scopeId = teachingClassId;
    } else if (courseId) {
      type = 'course';
      scopeId = courseId;
    }
  } else {
    scopeId = toNum(req.query.scopeId || req.query.scope_id);
    if (!scopeId) {
      if (type === 'legacy_class') scopeId = classId;
      else if (type === 'teaching_class') scopeId = teachingClassId;
      else if (type === 'course') scopeId = courseId;
    }
  }

  if (!type || !scopeId) {
    return { ok: false, status: 400, message: '请指定统计范围（行政班 classId、教学班 teachingClassId 或课程 courseId）' };
  }

  if (req.user.role === 'teacher') {
    const tid = req.user.id;
    if (type === 'legacy_class') {
      const ok = await teacherManagesClass(tid, scopeId);
      if (!ok) return { ok: false, status: 403, message: '无权查看该班级统计' };
    } else if (type === 'teaching_class') {
      const ok = await teacherManagesTeachingClass(tid, scopeId);
      if (!ok) return { ok: false, status: 403, message: '无权查看该教学班统计' };
    } else if (type === 'course') {
      const ok = await teacherLeadsCourse(tid, scopeId);
      if (!ok) {
        return { ok: false, status: 403, message: '仅课程负责人可查看课程级统计，请选择教学班范围' };
      }
    } else {
      return { ok: false, status: 400, message: '无效的 scopeType' };
    }
  } else if (req.user.role !== 'admin') {
    return { ok: false, status: 403, message: '权限不足' };
  }

  if (termId && type === 'teaching_class') {
    const [tc] = await pool.query('SELECT term_id FROM teaching_classes WHERE id = ?', [scopeId]);
    if (tc.length && Number(tc[0].term_id) !== Number(termId)) {
      return { ok: false, status: 400, message: '教学班与学期不匹配' };
    }
  }

  return { ok: true, type, scopeId, termId, taskId, teacherId: req.user.role === 'teacher' ? req.user.id : null };
}

/** 返回 { studentWhereSql, params, taskWhereSql, taskParams } */
function buildScopeSql(scope) {
  const { type, scopeId, termId, taskId } = scope;
  const studentWhere = [];
  const studentParams = [];
  const taskWhere = [];
  const taskParams = [];

  if (type === 'legacy_class') {
    studentWhere.push('s.student_id IN (SELECT id FROM users WHERE class_id = ? AND role = ?)');
    studentParams.push(scopeId, 'student');
    taskWhere.push('(t.class_id = ?)');
    taskParams.push(scopeId);
  } else if (type === 'teaching_class') {
    studentWhere.push(
      's.student_id IN (SELECT student_id FROM teaching_class_students WHERE teaching_class_id = ?)'
    );
    studentParams.push(scopeId);
    taskWhere.push('(t.teaching_class_id = ?)');
    taskParams.push(scopeId);
    if (termId) {
      taskWhere.push(
        'EXISTS (SELECT 1 FROM teaching_classes tc2 WHERE tc2.id = t.teaching_class_id AND tc2.term_id = ?)'
      );
      taskParams.push(termId);
    }
  } else if (type === 'course') {
    studentWhere.push(`s.student_id IN (
      SELECT tcs.student_id FROM teaching_class_students tcs
      JOIN teaching_classes tc ON tc.id = tcs.teaching_class_id
      WHERE tc.course_id = ?
    )`);
    studentParams.push(scopeId);
    taskWhere.push('(t.course_id = ?)');
    taskParams.push(scopeId);
    if (termId) {
      taskWhere.push(
        'EXISTS (SELECT 1 FROM teaching_classes tc3 WHERE tc3.id = t.teaching_class_id AND tc3.term_id = ?)'
      );
      taskParams.push(termId);
    }
  }

  if (taskId) {
    taskWhere.push('t.id = ?');
    taskParams.push(taskId);
  }

  if (scope.teacherId != null) {
    taskWhere.push('t.created_by = ?');
    taskParams.push(scope.teacherId);
  }

  return {
    studentWhereSql: studentWhere.join(' AND '),
    studentParams,
    taskWhereSql: taskWhere.length ? taskWhere.join(' AND ') : '1=1',
    taskParams,
  };
}

module.exports = { resolvePracticeScope, buildScopeSql, toNum };
