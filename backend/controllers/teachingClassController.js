const pool = require('../config/database');
const { parseId, trimOrNull } = require('../utils/curriculumHelpers');
const {
  teacherManagesTeachingClass,
  enterpriseHasTeachingClassAccess,
} = require('../utils/accessControl');
const rt = require('../utils/realtimeEmit');

const tcSelectSql = `
  SELECT tc.id, tc.course_id, tc.term_id, tc.class_code, tc.class_name, tc.location, tc.status,
         tc.created_at, tc.updated_at,
         c.course_code, c.course_name, c.leader_id,
         tm.name AS term_name, tm.year AS term_year, tm.season AS term_season,
         (SELECT COUNT(*) FROM teaching_class_students tcs WHERE tcs.teaching_class_id = tc.id) AS student_count,
         (SELECT COUNT(*) FROM teaching_class_teachers tct WHERE tct.teaching_class_id = tc.id) AS teacher_count
  FROM teaching_classes tc
  INNER JOIN courses c ON c.id = tc.course_id
  INNER JOIN terms tm ON tm.id = tc.term_id
`;

async function attachMyTeachingClassRoles(rows, userId, userRole) {
  if (!rows.length) return rows;
  if (userRole === 'enterprise') {
    return rows.map((row) => ({ ...row, my_roles: ['enterprise_mentor'] }));
  }
  if (userRole !== 'teacher') {
    return rows.map((row) => ({ ...row, my_roles: [] }));
  }

  const tid = Number(userId);
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const [tctRows] = await pool.query(
    `SELECT teaching_class_id, role FROM teaching_class_teachers
     WHERE teacher_id = ? AND teaching_class_id IN (${ph})`,
    [tid, ...ids]
  );
  const tctMap = new Map(tctRows.map((r) => [r.teaching_class_id, r.role]));

  return rows.map((row) => {
    const my_roles = [];
    if (Number(row.leader_id) === tid) my_roles.push('course_leader');
    const tcRole = tctMap.get(row.id);
    if (tcRole === 'lead') my_roles.push('lead_teacher');
    else if (tcRole === 'assistant') my_roles.push('assistant_teacher');
    return { ...row, my_roles };
  });
}

async function assertTeacherCanManage(req, teachingClassId) {
  if (req.user.role === 'admin') return true;
  if (req.user.role !== 'teacher') return false;
  return teacherManagesTeachingClass(req.user.id, teachingClassId);
}

const listTeachingClasses = async (req, res) => {
  try {
    const role = req.user.role;
    const uid = req.user.id;
    let sql = `${tcSelectSql} WHERE 1=1`;
    const params = [];

    if (role === 'teacher') {
      sql += ` AND (
        EXISTS (SELECT 1 FROM teaching_class_teachers tct WHERE tct.teaching_class_id = tc.id AND tct.teacher_id = ?)
        OR c.leader_id = ?
      )`;
      params.push(uid, uid);
    } else if (role === 'student') {
      sql += ` AND EXISTS (
        SELECT 1 FROM teaching_class_students tcs WHERE tcs.teaching_class_id = tc.id AND tcs.student_id = ?
      )`;
      params.push(uid);
    } else if (role === 'enterprise') {
      sql += ` AND EXISTS (
        SELECT 1 FROM enterprise_teaching_class_access e WHERE e.teaching_class_id = tc.id AND e.enterprise_user_id = ?
      )`;
      params.push(uid);
    }

    if (req.query.courseId) {
      sql += ' AND tc.course_id = ?';
      params.push(parseId(req.query.courseId));
    }
    if (req.query.termId) {
      sql += ' AND tc.term_id = ?';
      params.push(parseId(req.query.termId));
    }

    sql += ' ORDER BY tm.year DESC, tc.class_code';
    const [rows] = await pool.query(sql, params);
    const data = await attachMyTeachingClassRoles(rows, uid, role);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取教学班列表失败', error: error.message });
  }
};

const listMyTeachingClasses = listTeachingClasses;

const getTeachingClassById = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [rows] = await pool.query(`${tcSelectSql} WHERE tc.id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '教学班不存在' });

    const row = rows[0];
    const role = req.user.role;
    const uid = req.user.id;

    if (role === 'teacher') {
      const ok = await teacherManagesTeachingClass(uid, id);
      if (!ok) return res.status(404).json({ success: false, message: '教学班不存在' });
    } else if (role === 'student') {
      const [en] = await pool.query(
        'SELECT 1 FROM teaching_class_students WHERE teaching_class_id = ? AND student_id = ? LIMIT 1',
        [id, uid]
      );
      if (!en.length) return res.status(404).json({ success: false, message: '教学班不存在' });
    } else if (role === 'enterprise') {
      const ok = await enterpriseHasTeachingClassAccess(uid, id);
      if (!ok) return res.status(404).json({ success: false, message: '教学班不存在' });
    }

    const [teachers] = await pool.query(
      `SELECT tct.teacher_id, tct.role, u.real_name, u.username
       FROM teaching_class_teachers tct
       INNER JOIN users u ON u.id = tct.teacher_id
       WHERE tct.teaching_class_id = ?`,
      [id]
    );
    const [students] = await pool.query(
      `SELECT tcs.student_id, tcs.source_class_id, u.real_name, u.username, u.student_no,
              cl.class_name AS source_class_name
       FROM teaching_class_students tcs
       INNER JOIN users u ON u.id = tcs.student_id
       LEFT JOIN classes cl ON cl.id = tcs.source_class_id
       WHERE tcs.teaching_class_id = ?
       ORDER BY u.student_no, u.username`,
      [id]
    );

    res.json({
      success: true,
      data: { ...row, teachers, students },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取教学班失败', error: error.message });
  }
};

const createTeachingClass = async (req, res) => {
  try {
    const courseId = parseId(req.body.courseId || req.body.course_id);
    const termId = parseId(req.body.termId || req.body.term_id);
    const classCode = trimOrNull(req.body.classCode || req.body.class_code, 32);
    const className = trimOrNull(req.body.className || req.body.class_name, 120);
    if (!courseId || !termId || !classCode || !className) {
      return res.status(400).json({ success: false, message: '课程、学期、教学班代码与名称必填' });
    }

    if (req.user.role === 'teacher') {
      const [c] = await pool.query('SELECT leader_id FROM courses WHERE id = ?', [courseId]);
      if (!c.length) return res.status(400).json({ success: false, message: '课程不存在' });
      if (Number(c[0].leader_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: '仅课程负责人可创建教学班' });
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        'INSERT INTO teaching_classes (course_id, term_id, class_code, class_name, location, status) VALUES (?, ?, ?, ?, ?, ?)',
        [
          courseId,
          termId,
          classCode,
          className,
          trimOrNull(req.body.location, 120),
          req.body.status === 0 || req.body.status === '0' ? 0 : 1,
        ]
      );
      const tcId = result.insertId;
      let leadTeacherId = parseId(req.body.leadTeacherId || req.body.lead_teacher_id);
      if (!leadTeacherId && req.user.role === 'teacher') leadTeacherId = req.user.id;
      if (!leadTeacherId && req.user.role === 'admin') {
        const [cLead] = await conn.query('SELECT leader_id FROM courses WHERE id = ?', [courseId]);
        leadTeacherId = parseId(cLead[0]?.leader_id);
      }
      if (!leadTeacherId) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: '请指定主讲教师（leadTeacherId）或确保课程已设置负责人' });
      }
      await conn.query(
        'INSERT INTO teaching_class_teachers (teaching_class_id, teacher_id, role) VALUES (?, ?, ?)',
        [tcId, leadTeacherId, 'lead']
      );
      await conn.commit();
      res.status(201).json({ success: true, message: '创建成功', id: tcId });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: '该学期下教学班代码已存在' });
    }
    res.status(500).json({ success: false, message: '创建失败', error: error.message });
  }
};

const updateTeachingClass = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!(await assertTeacherCanManage(req, id))) {
      return res.status(403).json({ success: false, message: '无权修改该教学班' });
    }
    const classCode = trimOrNull(req.body.classCode || req.body.class_code, 32);
    const className = trimOrNull(req.body.className || req.body.class_name, 120);
    if (!classCode || !className) {
      return res.status(400).json({ success: false, message: '教学班代码与名称必填' });
    }
    const [r] = await pool.query(
      'UPDATE teaching_classes SET class_code = ?, class_name = ?, location = ?, status = ? WHERE id = ?',
      [
        classCode,
        className,
        trimOrNull(req.body.location, 120),
        req.body.status === 0 || req.body.status === '0' ? 0 : 1,
        id,
      ]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: '教学班不存在' });
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败', error: error.message });
  }
};

const deleteTeachingClass = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可删除教学班' });
    }
    const [r] = await pool.query('DELETE FROM teaching_classes WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: '教学班不存在' });
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
};

const setTeachingClassTeachers = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!(await assertTeacherCanManage(req, id))) {
      return res.status(403).json({ success: false, message: '无权管理该教学班教师' });
    }
    const teachers = Array.isArray(req.body.teachers) ? req.body.teachers : [];
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM teaching_class_teachers WHERE teaching_class_id = ?', [id]);
      for (const t of teachers) {
        const tid = parseId(t.teacherId || t.teacher_id || t.id);
        if (!tid) continue;
        const role = t.role === 'assistant' ? 'assistant' : 'lead';
        await conn.query(
          'INSERT INTO teaching_class_teachers (teaching_class_id, teacher_id, role) VALUES (?, ?, ?)',
          [id, tid, role]
        );
      }
      await conn.commit();
      res.json({ success: true, message: '教师绑定已更新' });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '更新教师失败', error: error.message });
  }
};

const setTeachingClassStudents = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!(await assertTeacherCanManage(req, id))) {
      return res.status(403).json({ success: false, message: '无权管理该教学班学生' });
    }
    const students = Array.isArray(req.body.students) ? req.body.students : [];
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM teaching_class_students WHERE teaching_class_id = ?', [id]);
      for (const s of students) {
        const sid = parseId(s.studentId || s.student_id || s.id);
        if (!sid) continue;
        const sourceClassId = parseId(s.sourceClassId || s.source_class_id) || null;
        await conn.query(
          'INSERT INTO teaching_class_students (teaching_class_id, student_id, source_class_id) VALUES (?, ?, ?)',
          [id, sid, sourceClassId]
        );
      }
      await conn.commit();
      res.json({ success: true, message: '学生绑定已更新' });
      try {
        const studentIds = students
          .map((s) => parseId(s.studentId || s.student_id || s.id))
          .filter(Boolean);
        for (const sid of studentIds) {
          rt.emitUsersMutate(sid, { scope: 'teaching_class', teachingClassId: id });
        }
      } catch {
        /* ignore */
      }
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '更新学生失败', error: error.message });
  }
};

module.exports = {
  listTeachingClasses,
  listMyTeachingClasses,
  getTeachingClassById,
  createTeachingClass,
  updateTeachingClass,
  deleteTeachingClass,
  setTeachingClassTeachers,
  setTeachingClassStudents,
};
