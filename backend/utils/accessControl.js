const pool = require('../config/database');

async function getStudentClassId(userId) {
  const [rows] = await pool.query(
    'SELECT class_id FROM users WHERE id = ? AND role = ?',
    [userId, 'student']
  );
  if (!rows.length) return null;
  const cid = rows[0].class_id;
  return cid == null ? null : Number(cid);
}

async function getStudentTeachingClassIds(userId) {
  const [rows] = await pool.query(
    'SELECT teaching_class_id FROM teaching_class_students WHERE student_id = ?',
    [userId]
  );
  return rows.map((r) => Number(r.teaching_class_id));
}

async function teacherManagesClass(teacherId, classId) {
  if (!classId) return false;
  const [rows] = await pool.query(
    'SELECT id FROM classes WHERE id = ? AND teacher_id = ?',
    [classId, teacherId]
  );
  return rows.length > 0;
}

async function teacherManagesTeachingClass(teacherId, teachingClassId) {
  if (!teachingClassId) return false;
  const [rows] = await pool.query(
    `SELECT 1 FROM teaching_class_teachers tct
     WHERE tct.teaching_class_id = ? AND tct.teacher_id = ?
     LIMIT 1`,
    [teachingClassId, teacherId]
  );
  if (rows.length) return true;
  const [lead] = await pool.query(
    `SELECT 1 FROM teaching_classes tc
     INNER JOIN courses c ON c.id = tc.course_id
     WHERE tc.id = ? AND c.leader_id = ?
     LIMIT 1`,
    [teachingClassId, teacherId]
  );
  return lead.length > 0;
}

async function teacherLeadsCourse(teacherId, courseId) {
  if (!courseId) return false;
  const [rows] = await pool.query(
    'SELECT 1 FROM courses WHERE id = ? AND leader_id = ? LIMIT 1',
    [courseId, teacherId]
  );
  return rows.length > 0;
}

async function teacherOwnsCourse(teacherId, courseId) {
  if (!courseId) return false;
  const [rows] = await pool.query(
    'SELECT 1 FROM courses WHERE id = ? AND leader_id = ? LIMIT 1',
    [courseId, teacherId]
  );
  if (rows.length) return true;
  const [tc] = await pool.query(
    `SELECT 1 FROM teaching_class_teachers tct
     INNER JOIN teaching_classes tc ON tc.id = tct.teaching_class_id
     WHERE tc.course_id = ? AND tct.teacher_id = ?
     LIMIT 1`,
    [courseId, teacherId]
  );
  return tc.length > 0;
}

async function getTaskRow(taskId) {
  const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
  return rows[0] || null;
}

/** 教师是否为任务创建者（任务列表 / 提交 / 批改 / 导出唯一依据） */
function teacherIsTaskCreator(teacherId, task) {
  if (!task) return false;
  return Number(task.created_by) === Number(teacherId);
}

/** 教师是否可查看/批改任务（等同 created_by，与 getAllTasks 筛选一致） */
async function teacherCanViewTask(teacherId, taskOrId) {
  if (typeof taskOrId === 'object' && taskOrId != null) {
    return teacherIsTaskCreator(teacherId, taskOrId);
  }
  const taskId = Number(taskOrId);
  if (!Number.isFinite(taskId)) return false;
  const task = await getTaskRow(taskId);
  return teacherIsTaskCreator(teacherId, task);
}

/** 教师是否可编辑/删除/批改任务（仅创建者） */
async function teacherCanManageTask(teacherId, task) {
  return teacherIsTaskCreator(teacherId, task);
}

/** SQL：教师任务列表 — 仅本人创建的任务 */
function teacherTaskVisibilityWhere(alias = 't') {
  return `${alias}.created_by = ?`;
}

function teacherTaskVisibilityParams(teacherId) {
  return [Number(teacherId)];
}

/** 教师是否可批改该任务 */
async function teacherOwnsTaskForGrading(teacherId, taskId) {
  const task = await getTaskRow(taskId);
  if (!task) return null;
  return teacherIsTaskCreator(teacherId, task) ? task : null;
}

/** 教师是否可批改该提交 */
async function teacherOwnsSubmissionTask(teacherId, submissionId) {
  const [rows] = await pool.query(
    `SELECT s.id AS submission_id, t.id AS task_id, t.class_id, t.teaching_class_id, t.created_by
     FROM submissions s
     JOIN tasks t ON s.task_id = t.id
     WHERE s.id = ?`,
    [submissionId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return teacherIsTaskCreator(teacherId, row) ? row : null;
}

async function studentCanAccessTask(studentId, taskId) {
  const task = await getTaskRow(taskId);
  if (!task) return false;

  if (task.teaching_class_id) {
    const [rows] = await pool.query(
      'SELECT 1 FROM teaching_class_students WHERE teaching_class_id = ? AND student_id = ? LIMIT 1',
      [task.teaching_class_id, studentId]
    );
    if (rows.length) return true;
  }

  const cid = await getStudentClassId(studentId);
  if (cid == null) return false;
  return Number(task.class_id) === Number(cid);
}

async function enterpriseHasClassAccess(enterpriseUserId, classId) {
  if (!classId) return false;
  const [rows] = await pool.query(
    'SELECT 1 FROM enterprise_class_access WHERE enterprise_user_id = ? AND class_id = ? LIMIT 1',
    [enterpriseUserId, classId]
  );
  return rows.length > 0;
}

async function enterpriseHasTeachingClassAccess(enterpriseUserId, teachingClassId) {
  if (!teachingClassId) return false;
  const [rows] = await pool.query(
    'SELECT 1 FROM enterprise_teaching_class_access WHERE enterprise_user_id = ? AND teaching_class_id = ? LIMIT 1',
    [enterpriseUserId, teachingClassId]
  );
  return rows.length > 0;
}

async function enterpriseCanAccessTask(enterpriseUserId, taskId) {
  const task = await getTaskRow(taskId);
  if (!task) return null;

  if (task.teaching_class_id) {
    const ok = await enterpriseHasTeachingClassAccess(enterpriseUserId, task.teaching_class_id);
    return ok ? task : null;
  }

  const ok = await enterpriseHasClassAccess(enterpriseUserId, task.class_id);
  return ok ? task : null;
}

async function enterpriseOwnsSubmissionTask(enterpriseUserId, submissionId) {
  const [rows] = await pool.query(
    `SELECT s.id AS submission_id, s.task_id, t.class_id, t.teaching_class_id
     FROM submissions s
     JOIN tasks t ON s.task_id = t.id
     WHERE s.id = ?`,
    [submissionId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  const task = await getTaskRow(row.task_id);
  if (!task) return null;
  const ok = await enterpriseCanAccessTask(enterpriseUserId, task.id);
  return ok ? row : null;
}

async function teacherCanViewStudent(teacherId, studentId) {
  const [rows] = await pool.query(
    'SELECT class_id FROM users WHERE id = ? AND role = ? LIMIT 1',
    [studentId, 'student']
  );
  if (rows.length && rows[0].class_id) {
    if (await teacherManagesClass(teacherId, rows[0].class_id)) return true;
  }
  const [tcMember] = await pool.query(
    `SELECT 1 FROM teaching_class_students tcs
     INNER JOIN teaching_class_teachers tct ON tct.teaching_class_id = tcs.teaching_class_id
     WHERE tcs.student_id = ? AND tct.teacher_id = ?
     LIMIT 1`,
    [studentId, teacherId]
  );
  if (tcMember.length) return true;
  const tcIds = await getStudentTeachingClassIds(studentId);
  for (const tcId of tcIds) {
    if (await teacherManagesTeachingClass(teacherId, tcId)) return true;
  }
  return false;
}

/** 教师端知识图谱：行政班负责人或教学班任课教师 */
async function teacherCanAccessKgScope(teacherId, scopeType, scopeId) {
  const id = Number(scopeId);
  if (!Number.isFinite(id)) return false;
  const type = String(scopeType || '').trim();
  if (type === 'administrative_class' || type === 'class') {
    return teacherManagesClass(teacherId, id);
  }
  if (type === 'teaching_class') {
    return teacherManagesTeachingClass(teacherId, id);
  }
  return false;
}

module.exports = {
  getStudentClassId,
  getStudentTeachingClassIds,
  teacherManagesClass,
  teacherManagesTeachingClass,
  teacherLeadsCourse,
  teacherOwnsCourse,
  teacherIsTaskCreator,
  teacherCanManageTask,
  teacherCanViewTask,
  teacherTaskVisibilityWhere,
  teacherTaskVisibilityParams,
  getTaskRow,
  teacherOwnsTaskForGrading,
  teacherOwnsSubmissionTask,
  teacherCanViewStudent,
  teacherCanAccessKgScope,
  studentCanAccessTask,
  enterpriseHasClassAccess,
  enterpriseHasTeachingClassAccess,
  enterpriseCanAccessTask,
  enterpriseOwnsSubmissionTask,
};
