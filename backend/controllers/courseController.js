const pool = require('../config/database');
const { parseId, trimOrNull } = require('../utils/curriculumHelpers');
const { teacherOwnsCourse } = require('../utils/accessControl');

async function attachMyCourseRoles(rows, teacherId) {
  if (!rows.length) return rows;
  const tid = Number(teacherId);
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const [tcRows] = await pool.query(
    `SELECT tc.course_id, tct.role
     FROM teaching_class_teachers tct
     INNER JOIN teaching_classes tc ON tc.id = tct.teaching_class_id
     WHERE tct.teacher_id = ? AND tc.course_id IN (${ph})`,
    [tid, ...ids]
  );
  const tcRoleMap = new Map();
  for (const r of tcRows) {
    if (!tcRoleMap.has(r.course_id)) tcRoleMap.set(r.course_id, new Set());
    if (r.role === 'lead') tcRoleMap.get(r.course_id).add('lead_teacher');
    else tcRoleMap.get(r.course_id).add('assistant_teacher');
  }
  return rows.map((row) => {
    const my_roles = [];
    if (Number(row.leader_id) === tid) my_roles.push('course_leader');
    const tcRoles = tcRoleMap.get(row.id);
    if (tcRoles?.has('lead_teacher')) my_roles.push('lead_teacher');
    if (tcRoles?.has('assistant_teacher')) my_roles.push('assistant_teacher');
    return { ...row, my_roles };
  });
}

const courseSelectSql = `
  SELECT c.id, c.course_code, c.course_name, c.major_id, m.name AS major_name,
         c.course_type, c.course_goal, c.ability_goals, c.leader_id,
         u.real_name AS leader_name, c.status, c.created_at, c.updated_at
  FROM courses c
  LEFT JOIN majors m ON c.major_id = m.id
  LEFT JOIN users u ON c.leader_id = u.id
`;

const listCourses = async (req, res) => {
  try {
    const role = req.user.role;
    const uid = req.user.id;
    let sql = `${courseSelectSql} WHERE 1=1`;
    const params = [];

    if (role === 'teacher') {
      sql += ` AND (
        c.leader_id = ?
        OR EXISTS (
          SELECT 1 FROM teaching_class_teachers tct
          INNER JOIN teaching_classes tc ON tc.id = tct.teaching_class_id
          WHERE tc.course_id = c.id AND tct.teacher_id = ?
        )
      )`;
      params.push(uid, uid);
    } else if (role === 'student') {
      sql += ` AND EXISTS (
        SELECT 1 FROM teaching_class_students tcs
        INNER JOIN teaching_classes tc ON tc.id = tcs.teaching_class_id
        WHERE tc.course_id = c.id AND tcs.student_id = ?
      )`;
      params.push(uid);
    }

    if (req.query.majorId) {
      sql += ' AND c.major_id = ?';
      params.push(parseId(req.query.majorId));
    }
    if (req.query.status !== undefined && req.query.status !== '') {
      sql += ' AND c.status = ?';
      params.push(Number(req.query.status) ? 1 : 0);
    }

    sql += ' ORDER BY c.course_code';
    const [rows] = await pool.query(sql, params);
    const data = role === 'teacher' ? await attachMyCourseRoles(rows, uid) : rows;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取课程列表失败', error: error.message });
  }
};

const listMyCourses = async (req, res) => {
  try {
    const uid = req.user.id;
    let sql = `${courseSelectSql} WHERE (
      c.leader_id = ?
      OR EXISTS (
        SELECT 1 FROM teaching_class_teachers tct
        INNER JOIN teaching_classes tc ON tc.id = tct.teaching_class_id
        WHERE tc.course_id = c.id AND tct.teacher_id = ?
      )
    )`;
    const params = [uid, uid];
    if (req.query.majorId) {
      sql += ' AND c.major_id = ?';
      params.push(parseId(req.query.majorId));
    }
    sql += ' ORDER BY c.course_code';
    const [rows] = await pool.query(sql, params);
    const data = await attachMyCourseRoles(rows, uid);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取我的课程失败', error: error.message });
  }
};

const getCourseById = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [rows] = await pool.query(`${courseSelectSql} WHERE c.id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '课程不存在' });

    const row = rows[0];
    if (req.user.role === 'teacher') {
      const ok = await teacherOwnsCourse(req.user.id, id);
      if (!ok) return res.status(404).json({ success: false, message: '课程不存在' });
    } else if (req.user.role === 'student') {
      const [en] = await pool.query(
        `SELECT 1 FROM teaching_class_students tcs
         INNER JOIN teaching_classes tc ON tc.id = tcs.teaching_class_id
         WHERE tc.course_id = ? AND tcs.student_id = ? LIMIT 1`,
        [id, req.user.id]
      );
      if (!en.length) return res.status(404).json({ success: false, message: '课程不存在' });
    }

    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取课程失败', error: error.message });
  }
};

const createCourse = async (req, res) => {
  try {
    const courseCode = trimOrNull(req.body.courseCode || req.body.course_code, 32);
    const courseName = trimOrNull(req.body.courseName || req.body.course_name, 120);
    if (!courseCode || !courseName) {
      return res.status(400).json({ success: false, message: '课程代码与名称必填' });
    }
    const leaderId = parseId(req.body.leaderId || req.body.leader_id) || null;
    const [result] = await pool.query(
      `INSERT INTO courses (course_code, course_name, major_id, course_type, course_goal, ability_goals, leader_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        courseCode,
        courseName,
        parseId(req.body.majorId || req.body.major_id),
        trimOrNull(req.body.courseType || req.body.course_type, 32),
        trimOrNull(req.body.courseGoal || req.body.course_goal),
        trimOrNull(req.body.abilityGoals || req.body.ability_goals),
        leaderId,
        req.body.status === 0 || req.body.status === '0' ? 0 : 1,
      ]
    );
    res.status(201).json({ success: true, message: '创建成功', id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: '课程代码已存在' });
    }
    res.status(500).json({ success: false, message: '创建失败', error: error.message });
  }
};

const updateCourse = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const courseCode = trimOrNull(req.body.courseCode || req.body.course_code, 32);
    const courseName = trimOrNull(req.body.courseName || req.body.course_name, 120);
    if (!courseCode || !courseName) {
      return res.status(400).json({ success: false, message: '课程代码与名称必填' });
    }
    const [r] = await pool.query(
      `UPDATE courses SET course_code = ?, course_name = ?, major_id = ?, course_type = ?,
        course_goal = ?, ability_goals = ?, leader_id = ?, status = ? WHERE id = ?`,
      [
        courseCode,
        courseName,
        parseId(req.body.majorId || req.body.major_id),
        trimOrNull(req.body.courseType || req.body.course_type, 32),
        trimOrNull(req.body.courseGoal || req.body.course_goal),
        trimOrNull(req.body.abilityGoals || req.body.ability_goals),
        parseId(req.body.leaderId || req.body.leader_id),
        req.body.status === 0 || req.body.status === '0' ? 0 : 1,
        id,
      ]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: '课程不存在' });
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败', error: error.message });
  }
};

const deleteCourse = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [r] = await pool.query('DELETE FROM courses WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: '课程不存在' });
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
};

module.exports = {
  listCourses,
  listMyCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
};
