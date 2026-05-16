const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const cache = require('../utils/cacheService');
const { validatePasswordPlaintext, hashPassword, verifyPassword } = require('../utils/passwordPolicy');

const uploadRoot = process.env.UPLOAD_PATH
  ? path.resolve(process.env.UPLOAD_PATH)
  : path.join(__dirname, '..', 'uploads');

function buildAvatarUrl(rel) {
  if (!rel) return null;
  const s = String(rel).replace(/^\/+/, '').replace(/^uploads\//, '');
  return `/uploads/${s}`;
}

/** MySQL2 可能返回 BigInt；Express JSON 序列化 BigInt 会抛错导致 500 */
function toNumberOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const USER_ME_SQL_WITH_AVATAR = `
      SELECT u.id, u.username, u.real_name, u.role, u.class_id, u.email,
             u.department AS user_department, u.avatar,
             c.class_name AS cls_class_name, c.major AS cls_major, c.grade AS cls_grade,
             tea.id AS class_teacher_id,
             tea.real_name AS teacher_name,
             tea.username AS teacher_username,
             tea.email AS teacher_email,
             tea.avatar AS teacher_avatar,
             tea.department AS teacher_department
      FROM users u
      LEFT JOIN classes c ON u.class_id = c.id
      LEFT JOIN users tea ON tea.id = c.teacher_id AND tea.role = 'teacher'
      WHERE u.id = ?
    `;

const USER_ME_SQL_NO_AVATAR = `
      SELECT u.id, u.username, u.real_name, u.role, u.class_id, u.email,
             u.department AS user_department,
             c.class_name AS cls_class_name, c.major AS cls_major, c.grade AS cls_grade,
             tea.id AS class_teacher_id,
             tea.real_name AS teacher_name,
             tea.username AS teacher_username,
             tea.email AS teacher_email,
             tea.department AS teacher_department
      FROM users u
      LEFT JOIN classes c ON u.class_id = c.id
      LEFT JOIN users tea ON tea.id = c.teacher_id AND tea.role = 'teacher'
      WHERE u.id = ?
    `;

const USER_ME_SQL_WITH_PROFILE = `
      SELECT u.id, u.username, u.real_name, u.role, u.class_id, u.email,
             u.phone, u.student_no, u.profile_bio, u.contact_extra,
             u.department AS user_department, u.avatar,
             c.class_name AS cls_class_name, c.major AS cls_major, c.grade AS cls_grade,
             tea.id AS class_teacher_id,
             tea.real_name AS teacher_name,
             tea.username AS teacher_username,
             tea.email AS teacher_email,
             tea.avatar AS teacher_avatar,
             tea.department AS teacher_department
      FROM users u
      LEFT JOIN classes c ON u.class_id = c.id
      LEFT JOIN users tea ON tea.id = c.teacher_id AND tea.role = 'teacher'
      WHERE u.id = ?
    `;

function isUnknownColumnError(err) {
  const msg = String(err?.sqlMessage || err?.message || '').toLowerCase();
  return (
    err?.code === 'ER_BAD_FIELD_ERROR' ||
    err?.errno === 1054 ||
    (err?.sqlState === '42S22' && msg.includes('unknown column'))
  );
}

function parseJsonMaybe(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

function weakPointsFromArchiveRow(row) {
  const list = [];
  if (row.ai_problems && String(row.ai_problems).trim()) {
    list.push({ label: 'AI 问题分析', detail: String(row.ai_problems).trim() });
  }
  const vr = parseJsonMaybe(row.verification_result);
  if (vr && typeof vr === 'object') {
    const cand = vr.logical_issues || vr.logic_issues || vr.weak_points || vr.gaps;
    if (Array.isArray(cand)) {
      cand.slice(0, 12).forEach((x, i) => {
        list.push({
          label: `智能核查 ${i + 1}`,
          detail: typeof x === 'string' ? x : JSON.stringify(x),
        });
      });
    } else if (typeof cand === 'string' && cand.trim()) {
      list.push({ label: '智能核查', detail: cand.trim() });
    }
  }
  return list;
}

const register = async (req, res) => {
  try {
    const { username, password, realName, email, classId } = req.body;

    const pv = validatePasswordPlaintext(password);
    if (!pv.ok) {
      return res.status(400).json({ success: false, message: pv.message, code: 'PASSWORD_POLICY' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }

    const hp = await hashPassword(password);
    if (!hp.ok) {
      return res.status(400).json({ success: false, message: hp.message, code: 'PASSWORD_HASH' });
    }

    const cid = classId === undefined || classId === null || classId === '' ? null : classId;

    const [result] = await pool.query(
      'INSERT INTO users (username, password, real_name, role, email, class_id) VALUES (?, ?, ?, ?, ?, ?)',
      [username, hp.hash, realName, 'student', email, cid]
    );

    res.status(201).json({ success: true, message: '注册成功', userId: result.insertId });
  } catch (error) {
    console.error('register', error);
    res.status(500).json({ success: false, message: '注册失败，请稍后重试' });
  }
};

const LOGIN_FAIL_BODY = { success: false, message: '用户名或密码错误' };

const login = async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = req.body.password;

    if (!username || password == null || password === '') {
      return res.status(401).json(LOGIN_FAIL_BODY);
    }

    const [users] = await pool.query(
      `SELECT id, username, password, real_name, role, class_id, email, department,
              IFNULL(is_disabled, 0) AS is_disabled, avatar, phone, student_no, profile_bio, contact_extra
       FROM users WHERE username = ? LIMIT 1`,
      [username]
    );
    if (users.length === 0) {
      return res.status(401).json(LOGIN_FAIL_BODY);
    }

    const user = users[0];
    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      return res.status(401).json(LOGIN_FAIL_BODY);
    }

    if (Number(user.is_disabled) === 1) {
      return res.status(403).json({ success: false, message: '账号已被禁用' });
    }

    const token = jwt.sign(
      {
        id: toNumberOrNull(user.id),
        username: user.username,
        role: user.role,
        ...(user.class_id != null ? { class_id: toNumberOrNull(user.class_id) } : {}),
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    let className = null;
    let classMajor = null;
    let classGrade = null;
    if (user.role === 'student' && user.class_id != null) {
      const [clsRows] = await pool.query(
        'SELECT class_name, major, grade FROM classes WHERE id = ? LIMIT 1',
        [user.class_id]
      );
      if (clsRows.length) {
        className = clsRows[0].class_name;
        classMajor = clsRows[0].major;
        classGrade = clsRows[0].grade;
      }
    }

    let managedClasses = [];
    if (user.role === 'teacher') {
      const [mc] = await pool.query(
        `SELECT id, class_name, major, grade FROM classes WHERE teacher_id = ? ORDER BY class_name`,
        [toNumberOrNull(user.id)]
      );
      managedClasses = mc.map((row) => ({
        id: toNumberOrNull(row.id),
        class_name: row.class_name,
        className: row.class_name,
        major: row.major,
        grade: row.grade,
      }));
    }

    res.json({
      success: true,
      message: '登录成功',
      token,
      user: {
        id: toNumberOrNull(user.id),
        username: user.username,
        realName: user.real_name,
        role: user.role,
        classId: toNumberOrNull(user.class_id),
        className,
        classMajor,
        classGrade,
        email: user.email,
        department: user.department || null,
        managedClasses,
        avatarUrl: buildAvatarUrl(user.avatar),
        phone: user.phone ?? null,
        studentNo: user.student_no ?? null,
        profileBio: user.profile_bio ?? null,
        contactExtra: user.contact_extra ?? null,
      },
    });
  } catch (error) {
    console.error('login', error);
    res.status(401).json(LOGIN_FAIL_BODY);
  }
};

const getUserInfo = async (req, res) => {
  try {
    const uid = toNumberOrNull(req.user?.id);
    if (uid == null) {
      return res.status(403).json({ success: false, message: '无效身份信息' });
    }

    const ckey = cache.kUserMe(uid);
    const cached = await cache.getJson(ckey);
    if (cached) {
      return res.json(cached);
    }

    let users;
    try {
      ;[users] = await pool.query(USER_ME_SQL_WITH_PROFILE, [uid]);
    } catch (e) {
      if (isUnknownColumnError(e)) {
        try {
          ;[users] = await pool.query(USER_ME_SQL_WITH_AVATAR, [uid]);
        } catch (e2) {
          const msg = String(e2.sqlMessage || e2.message || '').toLowerCase();
          if (isUnknownColumnError(e2) && msg.includes('avatar')) {
            ;[users] = await pool.query(USER_ME_SQL_NO_AVATAR, [uid]);
          } else {
            throw e2;
          }
        }
      } else {
        throw e;
      }
    }

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    const user = users[0];

    let managedClasses = [];
    if (user.role === 'teacher') {
      const [mc] = await pool.query(
        `SELECT id, class_name, major, grade FROM classes WHERE teacher_id = ? ORDER BY class_name`,
        [uid]
      );
      managedClasses = mc.map((row) => ({
        id: toNumberOrNull(row.id),
        class_name: row.class_name,
        className: row.class_name,
        major: row.major,
        grade: row.grade,
      }));
    }

    const ctId = toNumberOrNull(user.class_teacher_id);
    const classTeacher =
      user.role === 'student' && ctId != null
        ? {
            id: ctId,
            realName: user.teacher_name,
            username: user.teacher_username,
            email: user.teacher_email,
            department: user.teacher_department,
            avatarUrl: buildAvatarUrl(user.teacher_avatar),
          }
        : null;

    /** Redis 仅缓存业务展示字段，绝不写入 password / 密码哈希（降低缓存泄露风险） */
    const payload = {
      success: true,
      user: {
        id: toNumberOrNull(user.id),
        username: user.username,
        realName: user.real_name,
        role: user.role,
        classId: toNumberOrNull(user.class_id),
        className: user.cls_class_name ?? null,
        classMajor: user.cls_major ?? null,
        classGrade: user.cls_grade ?? null,
        email: user.email,
        department: user.user_department ?? user.department ?? null,
        avatar: user.avatar != null ? String(user.avatar) : null,
        avatarUrl: buildAvatarUrl(user.avatar),
        phone: user.phone ?? null,
        studentNo: user.student_no ?? null,
        profileBio: user.profile_bio ?? null,
        contactExtra: user.contact_extra ?? null,
        classTeacher,
        managedClasses,
      },
    };
    await cache.setJson(ckey, payload, cache.TTL.userMe);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: '获取用户信息失败', error: error.message });
  }
};

const updateMyProfile = async (req, res) => {
  try {
    const { phone, profileBio, contactExtra, studentNo } = req.body;
    const uid = toNumberOrNull(req.user?.id);
    const role = req.user?.role;

    const updates = [];
    const params = [];

    if (phone !== undefined) {
      const p = phone === null || phone === '' ? null : String(phone).trim().slice(0, 20);
      updates.push('phone = ?');
      params.push(p);
    }
    if (profileBio !== undefined) {
      updates.push('profile_bio = ?');
      params.push(profileBio === null || profileBio === '' ? null : String(profileBio).trim().slice(0, 2000));
    }
    if (contactExtra !== undefined) {
      updates.push('contact_extra = ?');
      params.push(contactExtra === null || contactExtra === '' ? null : String(contactExtra).trim().slice(0, 100));
    }
    if (role === 'student' && studentNo !== undefined) {
      updates.push('student_no = ?');
      params.push(studentNo === null || studentNo === '' ? null : String(studentNo).trim().slice(0, 32));
    }

    if (!updates.length) {
      return res.json({ success: true, message: '无变更' });
    }

    params.push(uid);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    try {
      await cache.invalidateUserMe(uid);
    } catch {
      /* ignore */
    }
    res.json({ success: true, message: '已保存' });
    try {
      const rt = require('../utils/realtimeEmit');
      rt.emitUsersMutate(uid, { scope: 'profile' });
    } catch {
      /* ignore */
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '保存失败', error: error.message });
  }
};

const getMyArchive = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: '仅学生可访问个人实训档案' });
    }
    const sid = req.user.id;
    const taskFilter = req.query.taskId != null && req.query.taskId !== '' ? Number(req.query.taskId) : null;

    let sql = `
      SELECT s.id AS submission_id, s.task_id, s.submitted_at,
             t.title AS task_title, t.deadline,
             gr.total_score, gr.final_score, gr.human_score, gr.status AS grade_status,
             gr.ai_comment, gr.human_comment, gr.ai_problems, gr.verification_result
      FROM submissions s
      JOIN tasks t ON s.task_id = t.id
      LEFT JOIN grading_results gr ON gr.submission_id = s.id
      WHERE s.student_id = ?
    `;
    const params = [sid];
    if (taskFilter != null && !Number.isNaN(taskFilter)) {
      sql += ' AND s.task_id = ?';
      params.push(taskFilter);
    }
    sql += ' ORDER BY s.submitted_at DESC';

    const [rows] = await pool.query(sql, params);
    const data = rows.map((row) => ({
      submission_id: toNumberOrNull(row.submission_id),
      task_id: toNumberOrNull(row.task_id),
      task_title: row.task_title,
      deadline: row.deadline,
      submitted_at: row.submitted_at,
      total_score: row.total_score != null ? Number(row.total_score) : null,
      final_score: row.final_score != null ? Number(row.final_score) : null,
      human_score: row.human_score != null ? Number(row.human_score) : null,
      grade_status: row.grade_status,
      ai_comment: row.ai_comment,
      human_comment: row.human_comment,
      weak_points: weakPointsFromArchiveRow(row),
    }));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取档案失败', error: error.message });
  }
};

const uploadMyAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请选择图片文件' });
    }

    const rel = path.posix.join('avatars', req.file.filename);
    const [oldRows] = await pool.query('SELECT avatar FROM users WHERE id = ?', [req.user.id]);
    const prev = oldRows[0]?.avatar;

    await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [rel, req.user.id]);
    try {
      await cache.invalidateUserMe(toNumberOrNull(req.user.id));
    } catch {
      /* ignore */
    }

    if (prev && prev !== rel) {
      const abs = path.join(uploadRoot, prev);
      try {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch (_) {}
    }

    res.json({
      success: true,
      message: '头像已更新',
      avatar: rel,
      avatarUrl: buildAvatarUrl(rel),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '上传失败', error: error.message });
  }
};

/** 教师检索可加入本班的候选：仅未分班（class_id IS NULL）学生，支持分页 + 关键字 */
const searchStudentsForClass = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;
    const q = (req.query.q || '').trim();

    let where = `u.role = 'student' AND u.class_id IS NULL`;
    const params = [];
    if (q.length >= 1) {
      const like = `%${q}%`;
      where += ` AND (u.username LIKE ? OR u.real_name LIKE ? OR IFNULL(u.email,'') LIKE ?)`;
      params.push(like, like, like);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u WHERE ${where}`,
      params
    );
    const total = toNumberOrNull(countRows[0].total) ?? 0;

    const [rows] = await pool.query(
      `
      SELECT u.id, u.username, u.real_name, u.email, u.class_id
      FROM users u
      WHERE ${where}
      ORDER BY u.username
      LIMIT ? OFFSET ?
    `,
      [...params, pageSize, offset]
    );

    res.json({
      success: true,
      data: rows,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '查询失败', error: error.message });
  }
};

const listAdminStudents = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
    const offset = (page - 1) * pageSize;
    const q = (req.query.q || '').trim();

    let searchClause = '';
    const baseParams = [];
    if (q) {
      const like = `%${q}%`;
      searchClause = ' AND (u.username LIKE ? OR u.real_name LIKE ? OR IFNULL(u.email,\'\') LIKE ?)';
      baseParams.push(like, like, like);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u WHERE u.role = 'student'${searchClause}`,
      baseParams
    );
    const total = toNumberOrNull(countRows[0].total) ?? 0;

    const [rows] = await pool.query(
      `
      SELECT u.id, u.username, u.real_name, u.email, u.class_id, c.class_name, u.department, u.created_at
      FROM users u
      LEFT JOIN classes c ON u.class_id = c.id
      WHERE u.role = 'student'${searchClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `,
      [...baseParams, pageSize, offset]
    );

    res.json({ success: true, data: rows, total, page, pageSize });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取学生列表失败', error: error.message });
  }
};

const listAdminTeachers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
    const offset = (page - 1) * pageSize;
    const q = (req.query.q || '').trim();

    let searchClause = '';
    const baseParams = [];
    if (q) {
      const like = `%${q}%`;
      searchClause = ' AND (u.username LIKE ? OR u.real_name LIKE ? OR IFNULL(u.email,\'\') LIKE ? OR IFNULL(u.department,\'\') LIKE ?)';
      baseParams.push(like, like, like, like);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u WHERE u.role = 'teacher'${searchClause}`,
      baseParams
    );
    const total = toNumberOrNull(countRows[0].total) ?? 0;

    const [rows] = await pool.query(
      `
      SELECT u.id, u.username, u.real_name, u.email, u.department, u.created_at
      FROM users u
      WHERE u.role = 'teacher'${searchClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `,
      [...baseParams, pageSize, offset]
    );

    res.json({ success: true, data: rows, total, page, pageSize });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取教师列表失败', error: error.message });
  }
};

const createStudent = async (req, res) => {
  try {
    const { username, password, realName, email, classId } = req.body;

    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }

    const pv = validatePasswordPlaintext(password);
    if (!pv.ok) {
      return res.status(400).json({ success: false, message: pv.message, code: 'PASSWORD_POLICY' });
    }
    const hp = await hashPassword(password);
    if (!hp.ok) {
      return res.status(400).json({ success: false, message: hp.message, code: 'PASSWORD_HASH' });
    }
    const cid = classId === undefined || classId === null || classId === '' ? null : classId;

    const [result] = await pool.query(
      'INSERT INTO users (username, password, real_name, role, email, class_id) VALUES (?, ?, ?, ?, ?, ?)',
      [username, hp.hash, realName, 'student', email || null, cid]
    );

    res.status(201).json({ success: true, message: '学生账号创建成功', userId: result.insertId });
  } catch (error) {
    res.status(500).json({ success: false, message: '创建失败', error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const [users] = await pool.query(`
      SELECT u.id, u.username, u.real_name, u.role, u.email, u.class_id, c.class_name, u.created_at,
             IFNULL(u.is_disabled, 0) AS is_disabled
      FROM users u
      LEFT JOIN classes c ON u.class_id = c.id
      ORDER BY u.role, u.created_at DESC
    `);
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取用户列表失败', error: error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const [users] = await pool.query(`
      SELECT u.id, u.username, u.real_name, u.role, u.email, u.class_id, u.department, c.class_name
      FROM users u
      LEFT JOIN classes c ON u.class_id = c.id
      WHERE u.id = ?
    `, [req.params.id]);
    
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    res.json({ success: true, data: users[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取用户信息失败', error: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { realName, email, classId, department, is_disabled } = req.body;

    if (is_disabled !== undefined && is_disabled !== null) {
      await pool.query(
        'UPDATE users SET real_name = ?, email = ?, class_id = ?, department = ?, is_disabled = ? WHERE id = ?',
        [realName, email, classId || null, department || null, is_disabled ? 1 : 0, req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE users SET real_name = ?, email = ?, class_id = ?, department = ? WHERE id = ?',
        [realName, email, classId || null, department || null, req.params.id]
      );
    }

    try {
      const targetId = toNumberOrNull(req.params.id);
      if (targetId != null) {
        await cache.invalidateUserMe(targetId);
      }
      await cache.invalidateAllClassCaches();
      await cache.invalidateDashboardAllCommon();
    } catch {
      /* ignore */
    }
    res.json({ success: true, message: '更新成功' });
    try {
      const rt = require('../utils/realtimeEmit');
      const tid = toNumberOrNull(req.params.id);
      rt.emitUsersMutate(tid, { scope: 'admin_update', classId: classId || null });
      if (classId) rt.emitClassesMutate({ classId: Number(classId) });
      rt.emitClassesMutate({});
    } catch {
      /* ignore */
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败', error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    if (rows[0].role === 'admin') {
      return res.status(400).json({ success: false, message: '不能删除管理员账号' });
    }
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    try {
      const targetId = toNumberOrNull(req.params.id);
      if (targetId != null) {
        await cache.invalidateUserMe(targetId);
      }
      await cache.invalidateAllClassCaches();
      await cache.invalidateDashboardAllCommon();
    } catch {
      /* ignore */
    }
    res.json({ success: true, message: '删除成功' });
    try {
      const rt = require('../utils/realtimeEmit');
      rt.emitUsersMutate(null, { scope: 'user_deleted' });
      rt.emitClassesMutate({});
    } catch {
      /* ignore */
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
};

const createEnterpriseUser = async (req, res) => {
  try {
    const username = req.body.username != null ? String(req.body.username).trim() : '';
    const password = req.body.password;
    const realName = req.body.realName != null ? String(req.body.realName).trim() : '';
    const email =
      req.body.email != null && String(req.body.email).trim() !== ''
        ? String(req.body.email).trim()
        : null;
    const department =
      req.body.department != null && String(req.body.department).trim() !== ''
        ? String(req.body.department).trim()
        : null;

    if (!username) {
      return res.status(400).json({ success: false, message: '请填写用户名' });
    }
    if (!realName) {
      return res.status(400).json({ success: false, message: '请填写姓名' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }

    if (email) {
      const [emailTaken] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      if (emailTaken.length > 0) {
        return res.status(400).json({ success: false, message: '该邮箱已被其他账号使用' });
      }
    }

    const pv = validatePasswordPlaintext(password);
    if (!pv.ok) {
      return res.status(400).json({ success: false, message: pv.message, code: 'PASSWORD_POLICY' });
    }
    const hp = await hashPassword(password);
    if (!hp.ok) {
      return res.status(400).json({ success: false, message: hp.message, code: 'PASSWORD_HASH' });
    }

    const [result] = await pool.query(
      'INSERT INTO users (username, password, real_name, role, email, department, class_id) VALUES (?, ?, ?, ?, ?, ?, NULL)',
      [username, hp.hash, realName, 'enterprise', email, department]
    );

    res.status(201).json({
      success: true,
      message: '企业账号创建成功',
      userId: toNumberOrNull(result.insertId),
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const msg = String(error.sqlMessage || '');
      if (msg.includes('username')) {
        return res.status(400).json({ success: false, message: '用户名已存在' });
      }
      if (msg.includes('email')) {
        return res.status(400).json({ success: false, message: '该邮箱已被其他账号使用' });
      }
      return res.status(400).json({ success: false, message: '数据重复（用户名或邮箱已存在）' });
    }

    const sqlMsg = String(error.sqlMessage || error.message || '');
    if (
      (sqlMsg.includes('Incorrect') && sqlMsg.includes("'enterprise'")) ||
      (sqlMsg.includes('Data truncated') && sqlMsg.includes('role'))
    ) {
      return res.status(500).json({
        success: false,
        message:
          '数据库尚未支持「企业导师」角色：请在 MySQL 中执行迁移脚本 backend/sql/migration_extension_v10.sql（扩展 users.role 枚举并创建 enterprise_class_access 等）。',
        error: sqlMsg,
      });
    }

    console.error('createEnterpriseUser', error);
    res.status(500).json({ success: false, message: '创建失败', error: sqlMsg });
  }
};

const listEnterpriseUsers = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT u.id, u.username, u.real_name, u.email, u.department, IFNULL(u.is_disabled,0) AS is_disabled, u.created_at
      FROM users u
      WHERE u.role = 'enterprise'
      ORDER BY u.created_at DESC
    `
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取企业账号失败', error: error.message });
  }
};

const getEnterpriseUserClasses = async (req, res) => {
  try {
    const enterpriseId = Number(req.params.id);
    const [u] = await pool.query(`SELECT id FROM users WHERE id = ? AND role = 'enterprise'`, [enterpriseId]);
    if (!u.length) {
      return res.status(404).json({ success: false, message: '企业用户不存在' });
    }
    const [rows] = await pool.query(
      `SELECT c.id, c.class_name FROM classes c
       INNER JOIN enterprise_class_access e ON e.class_id = c.id AND e.enterprise_user_id = ?
       ORDER BY c.class_name`,
      [enterpriseId]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: '查询失败', error: error.message });
  }
};

const setEnterpriseUserClasses = async (req, res) => {
  try {
    const enterpriseId = Number(req.params.id);
    const { classIds } = req.body;
    const [u] = await pool.query(`SELECT id FROM users WHERE id = ? AND role = 'enterprise'`, [enterpriseId]);
    if (!u.length) {
      return res.status(404).json({ success: false, message: '企业用户不存在' });
    }

    await pool.query('DELETE FROM enterprise_class_access WHERE enterprise_user_id = ?', [enterpriseId]);

    const ids = Array.isArray(classIds) ? classIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : [];
    for (const cid of ids) {
      await pool.query('INSERT IGNORE INTO enterprise_class_access (enterprise_user_id, class_id) VALUES (?, ?)', [
        enterpriseId,
        cid,
      ]);
    }

    res.json({ success: true, message: '已更新企业可访问班级' });
  } catch (error) {
    res.status(500).json({ success: false, message: '保存失败', error: error.message });
  }
};

const createTeacher = async (req, res) => {
  try {
    const { username, password, realName, email, department } = req.body;

    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }

    const pv = validatePasswordPlaintext(password);
    if (!pv.ok) {
      return res.status(400).json({ success: false, message: pv.message, code: 'PASSWORD_POLICY' });
    }
    const hp = await hashPassword(password);
    if (!hp.ok) {
      return res.status(400).json({ success: false, message: hp.message, code: 'PASSWORD_HASH' });
    }

    const [result] = await pool.query(
      'INSERT INTO users (username, password, real_name, role, email, department) VALUES (?, ?, ?, ?, ?, ?)',
      [username, hp.hash, realName, 'teacher', email, department]
    );

    res.status(201).json({ success: true, message: '教师创建成功', userId: result.insertId });
  } catch (error) {
    res.status(500).json({ success: false, message: '创建失败', error: error.message });
  }
};

module.exports = {
  register,
  login,
  getUserInfo,
  updateMyProfile,
  getMyArchive,
  uploadMyAvatar,
  searchStudentsForClass,
  listAdminStudents,
  listAdminTeachers,
  createStudent,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  createTeacher,
  createEnterpriseUser,
  listEnterpriseUsers,
  getEnterpriseUserClasses,
  setEnterpriseUserClasses,
};