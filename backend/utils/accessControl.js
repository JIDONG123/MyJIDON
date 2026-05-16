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

async function teacherManagesClass(teacherId, classId) {
  if (!classId) return false;
  const [rows] = await pool.query(
    'SELECT id FROM classes WHERE id = ? AND teacher_id = ?',
    [classId, teacherId]
  );
  return rows.length > 0;
}

async function getTaskRow(taskId) {
  const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
  return rows[0] || null;
}

/** 教师是否可批改该任务：本人发布且任务班级归其管理 */
async function teacherOwnsTaskForGrading(teacherId, taskId) {
  const task = await getTaskRow(taskId);
  if (!task || task.created_by !== teacherId) return null;
  if (!task.class_id) return null;
  const ok = await teacherManagesClass(teacherId, task.class_id);
  return ok ? task : null;
}

/** 教师是否拥有该提交对应的任务（发布者） */
async function teacherOwnsSubmissionTask(teacherId, submissionId) {
  const [rows] = await pool.query(
    `SELECT s.id AS submission_id, t.id AS task_id, t.class_id, t.created_by
     FROM submissions s
     JOIN tasks t ON s.task_id = t.id
     WHERE s.id = ?`,
    [submissionId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  if (row.created_by !== teacherId) return null;
  const ok = await teacherManagesClass(teacherId, row.class_id);
  return ok ? row : null;
}

async function studentCanAccessTask(studentId, taskId) {
  const cid = await getStudentClassId(studentId);
  if (cid == null) return false;
  const task = await getTaskRow(taskId);
  if (!task) return false;
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

async function enterpriseCanAccessTask(enterpriseUserId, taskId) {
  const task = await getTaskRow(taskId);
  if (!task) return null;
  const ok = await enterpriseHasClassAccess(enterpriseUserId, task.class_id);
  return ok ? task : null;
}

async function enterpriseOwnsSubmissionTask(enterpriseUserId, submissionId) {
  const [rows] = await pool.query(
    `SELECT s.id AS submission_id, s.task_id, t.class_id
     FROM submissions s
     JOIN tasks t ON s.task_id = t.id
     WHERE s.id = ?`,
    [submissionId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  const ok = await enterpriseHasClassAccess(enterpriseUserId, row.class_id);
  return ok ? row : null;
}

module.exports = {
  getStudentClassId,
  teacherManagesClass,
  getTaskRow,
  teacherOwnsTaskForGrading,
  teacherOwnsSubmissionTask,
  studentCanAccessTask,
  enterpriseHasClassAccess,
  enterpriseCanAccessTask,
  enterpriseOwnsSubmissionTask,
};
