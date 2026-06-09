const pool = require('../config/database');
const rt = require('./realtimeEmit');

async function notifyUser(userId, { type, title, body, refType, refId }) {
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, type, title, body || null, refType || null, refId != null ? refId : null]
  );
  try {
    rt.emitNotificationsUser(Number(userId), { type, refType, refId });
  } catch {
    /* ignore */
  }
}

async function notifyClassStudents(classId, payload) {
  if (!classId) return;
  const [rows] = await pool.query(`SELECT id FROM users WHERE role = 'student' AND class_id = ?`, [classId]);
  for (const r of rows) {
    try {
      await notifyUser(r.id, payload);
    } catch (_) {
      /* 通知失败不影响主流程 */
    }
  }
}

async function notifyTeachingClassStudents(teachingClassId, payload) {
  if (!teachingClassId) return;
  const [rows] = await pool.query(
    `SELECT student_id AS id FROM teaching_class_students WHERE teaching_class_id = ?`,
    [teachingClassId]
  );
  for (const r of rows) {
    try {
      await notifyUser(r.id, payload);
    } catch (_) {
      /* 通知失败不影响主流程 */
    }
  }
}

function safeNotify(promise) {
  promise.catch(() => {});
}

module.exports = { notifyUser, notifyClassStudents, notifyTeachingClassStudents, safeNotify };
