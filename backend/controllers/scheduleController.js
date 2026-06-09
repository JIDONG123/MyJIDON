const pool = require('../config/database');
const { parseId, trimOrNull } = require('../utils/curriculumHelpers');
const {
  teacherManagesTeachingClass,
  getStudentTeachingClassIds,
  enterpriseHasTeachingClassAccess,
} = require('../utils/accessControl');

const scheduleSelectSql = `
  SELECT cs.*, tc.class_name AS teaching_class_name, tc.class_code AS teaching_class_code,
         t.title AS task_title
  FROM course_schedules cs
  INNER JOIN teaching_classes tc ON tc.id = cs.teaching_class_id
  LEFT JOIN tasks t ON t.id = cs.task_id
`;

async function canViewSchedule(req, teachingClassId) {
  const role = req.user.role;
  const uid = req.user.id;
  if (role === 'admin') return true;
  if (role === 'teacher') return teacherManagesTeachingClass(uid, teachingClassId);
  if (role === 'student') {
    const ids = await getStudentTeachingClassIds(uid);
    return ids.includes(Number(teachingClassId));
  }
  if (role === 'enterprise') return enterpriseHasTeachingClassAccess(uid, teachingClassId);
  return false;
}

const listCalendar = async (req, res) => {
  try {
    const role = req.user.role;
    const uid = req.user.id;
    let sql = `${scheduleSelectSql} WHERE 1=1`;
    const params = [];

    const tcId = parseId(req.query.teachingClassId || req.query.teaching_class_id);
    const weekNo = parseId(req.query.weekNo || req.query.week_no);

    if (tcId) {
      if (!(await canViewSchedule(req, tcId))) {
        return res.status(403).json({ success: false, message: '无权查看该教学班课表' });
      }
      sql += ' AND cs.teaching_class_id = ?';
      params.push(tcId);
    } else if (role === 'teacher') {
      sql += ` AND (
        EXISTS (SELECT 1 FROM teaching_class_teachers tct WHERE tct.teaching_class_id = cs.teaching_class_id AND tct.teacher_id = ?)
        OR EXISTS (SELECT 1 FROM teaching_classes tc2 INNER JOIN courses c ON c.id = tc2.course_id WHERE tc2.id = cs.teaching_class_id AND c.leader_id = ?)
      )`;
      params.push(uid, uid);
    } else if (role === 'student') {
      sql += ` AND EXISTS (
        SELECT 1 FROM teaching_class_students tcs WHERE tcs.teaching_class_id = cs.teaching_class_id AND tcs.student_id = ?
      )`;
      params.push(uid);
    } else if (role === 'enterprise') {
      sql += ` AND EXISTS (
        SELECT 1 FROM enterprise_teaching_class_access e WHERE e.teaching_class_id = cs.teaching_class_id AND e.enterprise_user_id = ?
      )`;
      params.push(uid);
    }

    if (weekNo) {
      sql += ' AND cs.week_no = ?';
      params.push(weekNo);
    }

    sql += ' ORDER BY cs.week_no, cs.weekday, cs.period_start';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取实训日历失败', error: error.message });
  }
};

const getScheduleById = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [rows] = await pool.query(`${scheduleSelectSql} WHERE cs.id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '安排不存在' });
    if (!(await canViewSchedule(req, rows[0].teaching_class_id))) {
      return res.status(404).json({ success: false, message: '安排不存在' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取安排失败', error: error.message });
  }
};

const createSchedule = async (req, res) => {
  try {
    const teachingClassId = parseId(req.body.teachingClassId || req.body.teaching_class_id);
    const weekNo = parseId(req.body.weekNo || req.body.week_no);
    const weekday = parseInt(String(req.body.weekday), 10);
    if (!teachingClassId || !weekNo || !Number.isFinite(weekday) || weekday < 1 || weekday > 7) {
      return res.status(400).json({ success: false, message: '教学班、周次、星期必填' });
    }
    if (req.user.role === 'teacher') {
      const ok = await teacherManagesTeachingClass(req.user.id, teachingClassId);
      if (!ok) return res.status(403).json({ success: false, message: '无权管理该教学班课表' });
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '权限不足' });
    }

    const taskId = parseId(req.body.taskId || req.body.task_id);
    const [result] = await pool.query(
      `INSERT INTO course_schedules
        (teaching_class_id, week_no, weekday, period_start, period_end, location, title, task_id, remark, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        teachingClassId,
        weekNo,
        weekday,
        parseId(req.body.periodStart || req.body.period_start),
        parseId(req.body.periodEnd || req.body.period_end),
        trimOrNull(req.body.location, 120),
        trimOrNull(req.body.title, 200),
        taskId,
        trimOrNull(req.body.remark, 500),
        req.user.id,
      ]
    );
    res.status(201).json({ success: true, message: '创建成功', id: result.insertId });
  } catch (error) {
    res.status(500).json({ success: false, message: '创建失败', error: error.message });
  }
};

const updateSchedule = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [existing] = await pool.query(
      'SELECT id, teaching_class_id, week_no, weekday FROM course_schedules WHERE id = ?',
      [id]
    );
    if (!existing.length) return res.status(404).json({ success: false, message: '安排不存在' });
    const row = existing[0];
    if (req.user.role === 'teacher') {
      const ok = await teacherManagesTeachingClass(req.user.id, row.teaching_class_id);
      if (!ok) return res.status(403).json({ success: false, message: '无权修改' });
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '权限不足' });
    }

    const weekNo = parseId(req.body.weekNo || req.body.week_no) || row.week_no;
    const weekday = parseInt(String(req.body.weekday ?? row.weekday), 10);
    await pool.query(
      `UPDATE course_schedules SET week_no = ?, weekday = ?, period_start = ?, period_end = ?,
        location = ?, title = ?, task_id = ?, remark = ? WHERE id = ?`,
      [
        weekNo,
        weekday,
        parseId(req.body.periodStart || req.body.period_start),
        parseId(req.body.periodEnd || req.body.period_end),
        trimOrNull(req.body.location, 120),
        trimOrNull(req.body.title, 200),
        parseId(req.body.taskId || req.body.task_id),
        trimOrNull(req.body.remark, 500),
        id,
      ]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败', error: error.message });
  }
};

const deleteSchedule = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [existing] = await pool.query('SELECT teaching_class_id FROM course_schedules WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, message: '安排不存在' });
    if (req.user.role === 'teacher') {
      const ok = await teacherManagesTeachingClass(req.user.id, existing[0].teaching_class_id);
      if (!ok) return res.status(403).json({ success: false, message: '无权删除' });
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    await pool.query('DELETE FROM course_schedules WHERE id = ?', [id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
};

module.exports = {
  listCalendar,
  getScheduleById,
  createSchedule,
  updateSchedule,
  deleteSchedule,
};
