const pool = require('../config/database');
const { teacherManagesClass, enterpriseHasClassAccess } = require('../utils/accessControl');
const cache = require('../utils/cacheService');
const rt = require('../utils/realtimeEmit');

const getPublicClassNames = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, class_name FROM classes ORDER BY class_name'
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取班级列表失败', error: error.message });
  }
};

const getMyTeachingOverview = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const ckey = cache.kTeachingOverview(teacherId);
    const hit = await cache.getJson(ckey);
    if (hit) {
      return res.json(hit);
    }
    const [classes] = await pool.query(
      `
      SELECT c.id, c.class_name, c.major, c.grade,
             (SELECT COUNT(*) FROM users u WHERE u.class_id = c.id AND u.role = 'student') AS student_count
      FROM classes c
      WHERE c.teacher_id = ?
      ORDER BY c.class_name
    `,
      [teacherId]
    );

    const out = [];
    for (const c of classes) {
      const [students] = await pool.query(
        `SELECT id, username, real_name, email FROM users WHERE class_id = ? AND role = 'student' ORDER BY real_name`,
        [c.id]
      );
      const [[{ task_count }]] = await pool.query(
        `SELECT COUNT(*) AS task_count FROM tasks WHERE class_id = ? AND created_by = ?`,
        [c.id, teacherId]
      );
      out.push({
        id: c.id,
        class_name: c.class_name,
        major: c.major,
        grade: c.grade,
        studentCount: c.student_count,
        taskCount: task_count,
        students,
      });
    }

    const payload = { success: true, data: out };
    await cache.setJson(ckey, payload, cache.TTL.teachingOverview);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: '获取教学概览失败', error: error.message });
  }
};

const getAllClasses = async (req, res) => {
  try {
    const role = req.user.role;
    const uid = req.user.id;
    const ckey = cache.kClasses(role, uid);
    const hit = await cache.getJson(ckey);
    if (hit) {
      return res.json(hit);
    }
    let rows;
    if (req.user.role === 'teacher') {
      const [classes] = await pool.query(
        `
        SELECT c.id, c.class_name, c.major, c.grade, c.teacher_id, u.real_name as teacher_name, c.created_at
        FROM classes c
        LEFT JOIN users u ON c.teacher_id = u.id
        WHERE c.teacher_id = ?
        ORDER BY c.created_at DESC
      `,
        [req.user.id]
      );
      rows = classes;
    } else if (req.user.role === 'enterprise') {
      const [classes] = await pool.query(
        `
        SELECT c.id, c.class_name, c.major, c.grade, c.teacher_id, u.real_name as teacher_name, c.created_at
        FROM classes c
        INNER JOIN enterprise_class_access eca ON eca.class_id = c.id AND eca.enterprise_user_id = ?
        LEFT JOIN users u ON c.teacher_id = u.id
        ORDER BY c.class_name
      `,
        [req.user.id]
      );
      rows = classes;
    } else {
      const [classes] = await pool.query(`
        SELECT c.id, c.class_name, c.major, c.grade, c.teacher_id, u.real_name as teacher_name, c.created_at
        FROM classes c
        LEFT JOIN users u ON c.teacher_id = u.id
        ORDER BY c.created_at DESC
      `);
      rows = classes;
    }
    const payload = { success: true, data: rows };
    await cache.setJson(ckey, payload, cache.TTL.classesList);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: '获取班级列表失败', error: error.message });
  }
};

const getClassById = async (req, res) => {
  try {
    const id = req.params.id;
    const [classes] = await pool.query(
      `
      SELECT c.id, c.class_name, c.major, c.grade, c.teacher_id, u.real_name as teacher_name
      FROM classes c
      LEFT JOIN users u ON c.teacher_id = u.id
      WHERE c.id = ?
    `,
      [id]
    );

    if (classes.length === 0) {
      return res.status(404).json({ success: false, message: '班级不存在' });
    }

    const row = classes[0];
    if (req.user.role === 'teacher' && row.teacher_id !== req.user.id) {
      return res.status(404).json({ success: false, message: '班级不存在' });
    }
    if (req.user.role === 'enterprise') {
      const ok = await enterpriseHasClassAccess(req.user.id, id);
      if (!ok) {
        return res.status(404).json({ success: false, message: '班级不存在' });
      }
    }

    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取班级信息失败', error: error.message });
  }
};

const createClass = async (req, res) => {
  try {
    const { className, major, grade, teacherId } = req.body;

    const [existing] = await pool.query('SELECT id FROM classes WHERE class_name = ?', [className]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '班级名称已存在' });
    }

    const [result] = await pool.query(
      'INSERT INTO classes (class_name, major, grade, teacher_id) VALUES (?, ?, ?, ?)',
      [className, major, grade, teacherId || null]
    );

    try {
      await cache.invalidateAllClassCaches();
      await cache.invalidateDashboardAllCommon();
    } catch {
      /* ignore */
    }
    res.status(201).json({ success: true, message: '班级创建成功', classId: result.insertId });
    try {
      rt.emitClassesMutate({ classId: result.insertId });
    } catch {
      /* ignore */
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '创建失败', error: error.message });
  }
};

const updateClass = async (req, res) => {
  try {
    const { className, major, grade, teacherId } = req.body;

    await pool.query(
      'UPDATE classes SET class_name = ?, major = ?, grade = ?, teacher_id = ? WHERE id = ?',
      [className, major, grade, teacherId || null, req.params.id]
    );

    try {
      await cache.invalidateAllClassCaches();
      await cache.invalidateDashboardAllCommon();
    } catch {
      /* ignore */
    }
    res.json({ success: true, message: '更新成功' });
    try {
      rt.emitClassesMutate({ classId: Number(req.params.id) });
    } catch {
      /* ignore */
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败', error: error.message });
  }
};

const deleteClass = async (req, res) => {
  try {
    await pool.query('DELETE FROM classes WHERE id = ?', [req.params.id]);
    try {
      await cache.invalidateAllClassCaches();
      await cache.invalidateDashboardAllCommon();
    } catch {
      /* ignore */
    }
    res.json({ success: true, message: '删除成功' });
    try {
      rt.emitClassesMutate({});
    } catch {
      /* ignore */
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
};

const getClassStudents = async (req, res) => {
  try {
    const classId = req.params.id;
    const [cls] = await pool.query('SELECT teacher_id FROM classes WHERE id = ?', [classId]);
    if (!cls.length) {
      return res.status(404).json({ success: false, message: '班级不存在' });
    }
    if (req.user.role === 'teacher' && cls[0].teacher_id !== req.user.id) {
      return res.status(403).json({ success: false, message: '无权查看该班级学生' });
    }
    if (req.user.role === 'enterprise') {
      const ok = await enterpriseHasClassAccess(req.user.id, classId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权查看该班级学生' });
      }
    }

    const [students] = await pool.query(
      'SELECT id, username, real_name, email FROM users WHERE class_id = ? AND role = ? ORDER BY real_name',
      [classId, 'student']
    );
    res.json({ success: true, data: students });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取学生列表失败', error: error.message });
  }
};

const addStudentToClass = async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const studentId = Number(req.body.studentId);
    if (!studentId) {
      return res.status(400).json({ success: false, message: '请指定学生用户 studentId' });
    }

    const [cls] = await pool.query('SELECT id, teacher_id FROM classes WHERE id = ?', [classId]);
    if (!cls.length) {
      return res.status(404).json({ success: false, message: '班级不存在' });
    }
    if (req.user.role === 'teacher') {
      const ok = await teacherManagesClass(req.user.id, classId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权管理该班级' });
      }
    }

    const [users] = await pool.query('SELECT id, role, class_id FROM users WHERE id = ?', [studentId]);
    if (!users.length || users[0].role !== 'student') {
      return res.status(400).json({ success: false, message: '只能添加已注册的学生账号' });
    }
    if (users[0].class_id != null) {
      return res.status(400).json({
        success: false,
        message: '该学生已归属某一班级，不能重复添加。仅可将「未分班」学生加入本班。',
      });
    }

    await pool.query('UPDATE users SET class_id = ? WHERE id = ?', [classId, studentId]);
    try {
      await cache.invalidateAllClassCaches();
      await cache.invalidateUserMe(studentId);
      await cache.invalidateDashboardAllCommon();
    } catch {
      /* ignore */
    }
    res.json({ success: true, message: '学生已加入班级' });
    try {
      rt.emitUsersMutate(studentId, { classId });
      rt.emitClassesMutate({ classId });
    } catch {
      /* ignore */
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '添加学生失败', error: error.message });
  }
};

const addStudentsToClassBatch = async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const rawIds = req.body.studentIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ success: false, message: '请提供 studentIds 数组' });
    }
    const studentIds = [...new Set(rawIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
    if (!studentIds.length) {
      return res.status(400).json({ success: false, message: '学生 ID 无效' });
    }

    const [cls] = await pool.query('SELECT id, teacher_id FROM classes WHERE id = ?', [classId]);
    if (!cls.length) {
      return res.status(404).json({ success: false, message: '班级不存在' });
    }
    if (req.user.role === 'teacher') {
      const ok = await teacherManagesClass(req.user.id, classId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权管理该班级' });
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const ph = studentIds.map(() => '?').join(',');
      const [rows] = await conn.query(
        `SELECT id, class_id FROM users WHERE id IN (${ph}) AND role = 'student'`,
        studentIds
      );
      if (rows.length !== studentIds.length) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: '部分 ID 不是有效学生账号' });
      }
      const busy = rows.filter((r) => r.class_id != null);
      if (busy.length) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: `以下学生已分班，不能加入：${busy.map((r) => r.id).join(', ')}`,
        });
      }
      await conn.query(
        `UPDATE users SET class_id = ? WHERE id IN (${ph}) AND role = 'student' AND class_id IS NULL`,
        [classId, ...studentIds]
      );
      await conn.commit();
      try {
        await cache.invalidateAllClassCaches();
        for (const sid of studentIds) {
          await cache.invalidateUserMe(sid);
        }
        await cache.invalidateDashboardAllCommon();
      } catch {
        /* ignore */
      }
      res.json({ success: true, message: `已将 ${studentIds.length} 名学生加入本班`, count: studentIds.length });
      try {
        for (const sid of studentIds) {
          rt.emitUsersMutate(sid, { classId });
        }
        rt.emitClassesMutate({ classId });
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
    res.status(500).json({ success: false, message: '批量添加失败', error: error.message });
  }
};

module.exports = {
  getPublicClassNames,
  getMyTeachingOverview,
  getAllClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  getClassStudents,
  addStudentToClass,
  addStudentsToClassBatch,
};
