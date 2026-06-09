const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const cache = require('../utils/cacheService');
const { validatePasswordPlaintext, hashPassword, hashInitialStudentPassword, hashInitialTeacherPassword, verifyPassword, preparePasswordStorage } = require('../utils/passwordPolicy');
const { verifyCaptcha } = require('../utils/captchaService');
const {
  findUserByLoginIdentifier,
  LOGIN_FAIL_MESSAGE,
  IDENTIFIER_CONFLICT_MESSAGE,
} = require('../services/loginIdentifierService');
const { createUserSession, logoutUserSession } = require('../services/userSessionService');
const {
  validateFileBasic,
  detectImageSafety,
  validateAccountFields,
  auditAndReturn,
} = require('../services/contentSafetyService');

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
             u.phone, u.student_no, u.teacher_no, u.profile_bio, u.contact_extra,
             IFNULL(u.must_change_password, 0) AS must_change_password,
             u.password_changed_at,
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

async function assertUsernameAvailable(username, excludeId = null) {
  const u = String(username || '').trim();
  if (u.length < 2) {
    return { ok: false, message: '用户名至少 2 个字符' };
  }
  if (u.length > 64) {
    return { ok: false, message: '用户名过长' };
  }
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(u)) {
    return { ok: false, message: '用户名仅支持字母、数字、下划线与中文' };
  }
  let sql = 'SELECT id FROM users WHERE username = ?';
  const params = [u];
  if (excludeId != null) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  const [rows] = await pool.query(sql, params);
  if (rows.length) {
    return { ok: false, message: '用户名已存在' };
  }
  return { ok: true, username: u };
}

function passwordsMatch(a, b) {
  return String(a ?? '') === String(b ?? '');
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
      'INSERT INTO users (username, password, password_plain, real_name, role, email, class_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [username, hp.hash, String(password), realName, 'student', email, cid]
    );

    res.status(201).json({ success: true, message: '注册成功', userId: result.insertId });
  } catch (error) {
    console.error('register', error);
    res.status(500).json({ success: false, message: '注册失败，请稍后重试' });
  }
};

const LOGIN_FAIL_BODY = { success: false, message: LOGIN_FAIL_MESSAGE };

const login = async (req, res) => {
  try {
    const { captchaId, captchaCode } = req.body;
    const captchaResult = await verifyCaptcha(captchaId, captchaCode);
    if (!captchaResult.ok) {
      return res.status(400).json({ success: false, message: captchaResult.message, code: 'CAPTCHA' });
    }

    const loginIdentifier = String(req.body.username || '').trim();
    const password = req.body.password;

    if (!loginIdentifier || password == null || password === '') {
      return res.status(401).json(LOGIN_FAIL_BODY);
    }

    const lookup = await findUserByLoginIdentifier(pool, loginIdentifier);
    if (!lookup.ok) {
      if (lookup.code === 'IDENTIFIER_CONFLICT') {
        return res.status(409).json({
          success: false,
          message: IDENTIFIER_CONFLICT_MESSAGE,
          code: 'IDENTIFIER_CONFLICT',
        });
      }
      return res.status(401).json(LOGIN_FAIL_BODY);
    }

    const user = lookup.user;
    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      return res.status(401).json(LOGIN_FAIL_BODY);
    }

    if (Number(user.is_disabled) === 1) {
      return res.status(403).json({ success: false, message: '账号已被禁用' });
    }

    const loginIp =
      String(req.headers['x-forwarded-for'] || '')
        .split(',')[0]
        .trim() || req.ip || req.socket?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;
    const { sessionId } = await createUserSession(pool, {
      userId: toNumberOrNull(user.id),
      loginIp,
      userAgent,
    });

    const token = jwt.sign(
      {
        id: toNumberOrNull(user.id),
        username: user.username,
        role: user.role,
        sessionId,
        ...(user.class_id != null ? { class_id: toNumberOrNull(user.class_id) } : {}),
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
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
        teacherNo: user.teacher_no ?? null,
        profileBio: user.profile_bio ?? null,
        contactExtra: user.contact_extra ?? null,
        mustChangePassword: Number(user.must_change_password) === 1,
        passwordChangedAt: user.password_changed_at ?? null,
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
        teacherNo: user.teacher_no ?? null,
        profileBio: user.profile_bio ?? null,
        contactExtra: user.contact_extra ?? null,
        classTeacher,
        managedClasses,
        mustChangePassword: Number(user.must_change_password) === 1,
        passwordChangedAt: user.password_changed_at ?? null,
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

/** 教师 / 学生自主修改用户名与登录密码（须验证当前密码） */
const updateMyCredentials = async (req, res) => {
  try {
    const role = req.user?.role;
    if (!['teacher', 'student'].includes(role)) {
      return res.status(403).json({ success: false, message: '仅教师或学生可修改登录凭据' });
    }

    const uid = toNumberOrNull(req.user?.id);
    const { username, currentPassword, newPassword, confirmPassword } = req.body;

    if (currentPassword == null || String(currentPassword) === '') {
      return res.status(400).json({ success: false, message: '请输入当前密码以确认身份' });
    }

    const [rows] = await pool.query('SELECT id, username, password, role FROM users WHERE id = ? LIMIT 1', [uid]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    const row = rows[0];

    const okCurrent = await verifyPassword(currentPassword, row.password);
    if (!okCurrent) {
      return res.status(400).json({ success: false, message: '当前密码不正确' });
    }

    const updates = [];
    const params = [];
    let usernameChanged = false;

    if (username !== undefined && String(username).trim() !== row.username) {
      const un = await assertUsernameAvailable(username, uid);
      if (!un.ok) {
        return res.status(400).json({ success: false, message: un.message });
      }
      updates.push('username = ?');
      params.push(un.username);
      usernameChanged = true;
    }

    const wantsPassword = newPassword != null && String(newPassword).trim() !== '';
    if (wantsPassword) {
      if (!passwordsMatch(newPassword, confirmPassword)) {
        return res.status(400).json({ success: false, message: '两次输入的新密码不一致' });
      }
      const prep = await preparePasswordStorage(newPassword);
      if (!prep.ok) {
        return res.status(400).json({ success: false, message: prep.message, code: 'PASSWORD_POLICY' });
      }
      if (role === 'student') {
        updates.push(
          'password = ?',
          'password_plain = ?',
          'must_change_password = 0',
          'password_changed_at = NOW()'
        );
        params.push(prep.hash, null);
      } else {
        updates.push('password = ?', 'password_plain = ?');
        params.push(prep.hash, prep.plain);
      }
    }

    if (!updates.length) {
      return res.json({ success: true, message: '无变更', requireRelogin: false });
    }

    params.push(uid);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    try {
      await cache.invalidateUserMe(uid);
    } catch {
      /* ignore */
    }

    res.json({
      success: true,
      message: usernameChanged ? '登录凭据已更新，请重新登录' : '密码已更新',
      requireRelogin: usernameChanged,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '保存失败', error: error.message });
  }
};

const getAdminUserPassword = async (req, res) => {
  try {
    const targetId = toNumberOrNull(req.params.id);
    const [rows] = await pool.query(
      'SELECT id, username, real_name, role, password_plain FROM users WHERE id = ? LIMIT 1',
      [targetId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    const u = rows[0];
    if (u.role === 'admin') {
      return res.status(403).json({ success: false, message: '不能查看管理员密码' });
    }
    res.json({
      success: true,
      data: {
        id: toNumberOrNull(u.id),
        username: u.username,
        realName: u.real_name,
        password: u.password_plain || null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取密码失败', error: error.message });
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

    const basic = validateFileBasic(req.file, { profile: 'avatar', maxBytes: 2 * 1024 * 1024 });
    if (!basic.passed) {
      try {
        if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch (_) {}
      return res.status(400).json({ success: false, message: basic.reason || '文件类型不支持' });
    }

    const imgR = await detectImageSafety(req.file.path, { profile: 'avatar' });
    if (imgR.riskLevel === 'blocked') {
      try {
        if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch (_) {}
      await auditAndReturn(
        {
          targetType: 'avatar',
          userId: req.user.id,
          userRole: req.user.role,
          fileName: req.file.originalname,
          fileHash: basic.fileHash,
        },
        imgR
      );
      return res.status(400).json({ success: false, message: imgR.reason || '图片疑似包含违规内容' });
    }
    if (imgR.riskLevel === 'suspicious') {
      await auditAndReturn(
        {
          targetType: 'avatar',
          userId: req.user.id,
          userRole: req.user.role,
          fileName: req.file.originalname,
          fileHash: basic.fileHash,
        },
        imgR
      );
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
    const classId =
      req.query.classId != null && req.query.classId !== '' ? Number(req.query.classId) : null;

    let where = `u.role = 'student'`;
    const params = [];
    if (classId != null && Number.isFinite(classId)) {
      where += ' AND u.class_id = ?';
      params.push(classId);
    } else {
      where += ' AND u.class_id IS NULL';
    }
    if (q.length >= 1) {
      const like = `%${q}%`;
      where += ` AND (u.username LIKE ? OR u.real_name LIKE ? OR IFNULL(u.email,'') LIKE ? OR IFNULL(u.student_no,'') LIKE ?)`;
      params.push(like, like, like, like);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u WHERE ${where}`,
      params
    );
    const total = toNumberOrNull(countRows[0].total) ?? 0;

    const [rows] = await pool.query(
      `
      SELECT u.id, u.username, u.real_name, u.email, u.student_no, u.class_id, c.class_name
      FROM users u
      LEFT JOIN classes c ON u.class_id = c.id
      WHERE ${where}
      ORDER BY u.real_name, u.username
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
    const classId =
      req.query.classId != null && req.query.classId !== ''
        ? Number(req.query.classId)
        : null;
    const statusFilter = String(req.query.status || '').trim();

    let searchClause = '';
    const baseParams = [];
    if (q) {
      const like = `%${q}%`;
      searchClause =
        ' AND (u.username LIKE ? OR u.real_name LIKE ? OR IFNULL(u.email,\'\') LIKE ? OR IFNULL(u.student_no,\'\') LIKE ? OR IFNULL(u.phone,\'\') LIKE ?)';
      baseParams.push(like, like, like, like, like);
    }
    if (classId != null && Number.isFinite(classId)) {
      searchClause += ' AND u.class_id = ?';
      baseParams.push(classId);
    }
    if (statusFilter === 'assigned') {
      searchClause += ' AND u.class_id IS NOT NULL';
    } else if (statusFilter === 'unassigned') {
      searchClause += ' AND u.class_id IS NULL';
    } else if (statusFilter === 'must_change') {
      searchClause += ' AND IFNULL(u.must_change_password, 0) = 1';
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u WHERE u.role = 'student'${searchClause}`,
      baseParams
    );
    const total = toNumberOrNull(countRows[0].total) ?? 0;

    const [rows] = await pool.query(
      `
      SELECT u.id, u.username, u.real_name, u.email, u.phone, u.student_no, u.class_id, c.class_name,
             u.department, u.created_at, IFNULL(u.must_change_password, 0) AS must_change_password,
             u.password_changed_at
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
    const departmentFilter = (req.query.department || '').trim();
    const statusFilter = String(req.query.status || '').trim();

    let searchClause = '';
    const baseParams = [];
    if (q) {
      const like = `%${q}%`;
      searchClause =
        ' AND (u.username LIKE ? OR u.real_name LIKE ? OR IFNULL(u.email,\'\') LIKE ? OR IFNULL(u.department,\'\') LIKE ? OR IFNULL(u.teacher_no,\'\') LIKE ? OR IFNULL(u.phone,\'\') LIKE ?)';
      baseParams.push(like, like, like, like, like, like);
    }
    if (departmentFilter) {
      searchClause += ' AND u.department = ?';
      baseParams.push(departmentFilter);
    }
    if (statusFilter === 'must_change') {
      searchClause += ' AND IFNULL(u.must_change_password, 0) = 1';
    } else if (statusFilter === 'missing_no') {
      searchClause += ' AND (u.teacher_no IS NULL OR u.teacher_no = \'\')';
    } else if (statusFilter === 'normal') {
      searchClause += ' AND IFNULL(u.must_change_password, 0) = 0 AND u.teacher_no IS NOT NULL AND u.teacher_no <> \'\'';
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u WHERE u.role = 'teacher'${searchClause}`,
      baseParams
    );
    const total = toNumberOrNull(countRows[0].total) ?? 0;

    const [rows] = await pool.query(
      `
      SELECT u.id, u.username, u.real_name, u.email, u.phone, u.teacher_no, u.department, u.created_at,
             IFNULL(u.must_change_password, 0) AS must_change_password, u.password_changed_at
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
    const { username, realName, email, classId, studentNo, phone } = req.body;

    if (!username || !realName || !studentNo || !phone || !email) {
      return res.status(400).json({ success: false, message: '请填写用户名、真实姓名、学号、电话号码和邮箱' });
    }

    const fieldCheck = await validateAccountFields(
      { username, realName, studentNo, phone, email, className: req.body.className },
      'student'
    );
    if (!fieldCheck.passed) {
      return res.status(400).json({
        success: false,
        message: fieldCheck.errors.map((e) => e.message).join('；'),
      });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }
    const [dupNo] = await pool.query(
      'SELECT id FROM users WHERE student_no = ? AND student_no IS NOT NULL LIMIT 1',
      [String(studentNo).trim()]
    );
    if (dupNo.length) {
      return res.status(400).json({ success: false, message: '学号已存在' });
    }
    const [dupEmail] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (dupEmail.length) {
      return res.status(400).json({ success: false, message: '邮箱已被占用' });
    }

    const hp = await hashInitialStudentPassword(studentNo);
    if (!hp.ok) {
      return res.status(400).json({ success: false, message: hp.message });
    }
    const cid = classId === undefined || classId === null || classId === '' ? null : classId;

    const [result] = await pool.query(
      `INSERT INTO users
        (username, password, password_plain, real_name, student_no, phone, role, email, class_id, must_change_password)
       VALUES (?, ?, NULL, ?, ?, ?, 'student', ?, ?, 1)`,
      [
        String(username).trim(),
        hp.hash,
        String(realName).trim(),
        String(studentNo).trim(),
        String(phone).trim(),
        String(email).trim(),
        cid,
      ]
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
    const targetId = toNumberOrNull(req.params.id);
    if (targetId == null) {
      return res.status(400).json({ success: false, message: '无效用户 ID' });
    }

    const [targetRows] = await pool.query('SELECT id, role, username FROM users WHERE id = ? LIMIT 1', [targetId]);
    if (!targetRows.length) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    if (targetRows[0].role === 'admin') {
      return res.status(400).json({ success: false, message: '不能通过此接口修改管理员账号' });
    }

    const { username, password, confirmPassword, realName, email, classId, department, is_disabled, studentNo, phone, teacherNo } =
      req.body;

    const updates = [];
    const params = [];

    if (username !== undefined && String(username).trim() !== targetRows[0].username) {
      const un = await assertUsernameAvailable(username, targetId);
      if (!un.ok) {
        return res.status(400).json({ success: false, message: un.message });
      }
      updates.push('username = ?');
      params.push(un.username);
    }

    const wantsPassword = password != null && String(password).trim() !== '';
    if (wantsPassword) {
      if (!passwordsMatch(password, confirmPassword)) {
        return res.status(400).json({ success: false, message: '两次输入的密码不一致' });
      }
      const prep = await preparePasswordStorage(password);
      if (!prep.ok) {
        return res.status(400).json({ success: false, message: prep.message, code: 'PASSWORD_POLICY' });
      }
      updates.push('password = ?', 'password_plain = ?');
      params.push(prep.hash, prep.plain);
    }

    if (realName !== undefined) {
      updates.push('real_name = ?');
      params.push(realName);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    if (studentNo !== undefined && targetRows[0].role === 'student') {
      const sn = studentNo === null || studentNo === '' ? null : String(studentNo).trim();
      if (sn) {
        const [dup] = await pool.query(
          'SELECT id FROM users WHERE student_no = ? AND id <> ? LIMIT 1',
          [sn, targetId]
        );
        if (dup.length) {
          return res.status(400).json({ success: false, message: '学号已被占用' });
        }
      }
      updates.push('student_no = ?');
      params.push(sn);
    }
    if (phone !== undefined && targetRows[0].role === 'student') {
      updates.push('phone = ?');
      params.push(phone === null || phone === '' ? null : String(phone).trim());
    }
    if (teacherNo !== undefined && targetRows[0].role === 'teacher') {
      const tn = teacherNo === null || teacherNo === '' ? null : String(teacherNo).trim();
      if (tn) {
        const [dup] = await pool.query(
          'SELECT id FROM users WHERE teacher_no = ? AND id <> ? LIMIT 1',
          [tn, targetId]
        );
        if (dup.length) {
          return res.status(400).json({ success: false, message: '工号已被占用' });
        }
      }
      updates.push('teacher_no = ?');
      params.push(tn);
    }
    if (phone !== undefined && targetRows[0].role === 'teacher') {
      updates.push('phone = ?');
      params.push(phone === null || phone === '' ? null : String(phone).trim());
    }
    if (classId !== undefined) {
      updates.push('class_id = ?');
      params.push(classId || null);
    }
    if (department !== undefined) {
      updates.push('department = ?');
      params.push(department || null);
    }
    if (is_disabled !== undefined && is_disabled !== null) {
      updates.push('is_disabled = ?');
      params.push(is_disabled ? 1 : 0);
    }

    if (!updates.length) {
      return res.json({ success: true, message: '无变更' });
    }

    params.push(targetId);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    try {
      await cache.invalidateUserMe(targetId);
      await cache.invalidateAllClassCaches();
      await cache.invalidateDashboardAllCommon();
    } catch {
      /* ignore */
    }
    res.json({ success: true, message: '更新成功' });
    try {
      const rt = require('../utils/realtimeEmit');
      rt.emitUsersMutate(targetId, { scope: 'admin_update', classId: classId || null });
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
      'INSERT INTO users (username, password, password_plain, real_name, role, email, department, class_id) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)',
      [username, hp.hash, String(password), realName, 'enterprise', email, department]
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

const getEnterpriseUserTeachingClasses = async (req, res) => {
  try {
    const enterpriseId = Number(req.params.id);
    const [u] = await pool.query(`SELECT id FROM users WHERE id = ? AND role = 'enterprise'`, [enterpriseId]);
    if (!u.length) {
      return res.status(404).json({ success: false, message: '企业用户不存在' });
    }
    const [rows] = await pool.query(
      `SELECT tc.id, tc.class_code, tc.class_name, c.course_name, tm.name AS term_name
       FROM teaching_classes tc
       INNER JOIN enterprise_teaching_class_access e ON e.teaching_class_id = tc.id AND e.enterprise_user_id = ?
       INNER JOIN courses c ON c.id = tc.course_id
       INNER JOIN terms tm ON tm.id = tc.term_id
       ORDER BY tm.year DESC, tc.class_code`,
      [enterpriseId]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: '查询失败', error: error.message });
  }
};

const setEnterpriseUserTeachingClasses = async (req, res) => {
  try {
    const enterpriseId = Number(req.params.id);
    const teachingClassIds = req.body.teachingClassIds || req.body.teaching_class_ids;
    const [u] = await pool.query(`SELECT id FROM users WHERE id = ? AND role = 'enterprise'`, [enterpriseId]);
    if (!u.length) {
      return res.status(404).json({ success: false, message: '企业用户不存在' });
    }

    await pool.query('DELETE FROM enterprise_teaching_class_access WHERE enterprise_user_id = ?', [enterpriseId]);

    const ids = Array.isArray(teachingClassIds)
      ? teachingClassIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    for (const tcId of ids) {
      await pool.query(
        'INSERT IGNORE INTO enterprise_teaching_class_access (enterprise_user_id, teaching_class_id) VALUES (?, ?)',
        [enterpriseId, tcId]
      );
    }

    res.json({ success: true, message: '已更新企业可访问教学班' });
  } catch (error) {
    res.status(500).json({ success: false, message: '保存失败', error: error.message });
  }
};

const createTeacher = async (req, res) => {
  try {
    const username = req.body.username != null ? String(req.body.username).trim() : '';
    const realName = req.body.realName != null ? String(req.body.realName).trim() : '';
    const teacherNo = req.body.teacherNo != null ? String(req.body.teacherNo).trim() : '';
    const email =
      req.body.email != null && String(req.body.email).trim() !== ''
        ? String(req.body.email).trim()
        : null;
    const department =
      req.body.department != null && String(req.body.department).trim() !== ''
        ? String(req.body.department).trim()
        : null;
    const phone =
      req.body.phone != null && String(req.body.phone).trim() !== ''
        ? String(req.body.phone).trim()
        : null;

    if (!username) {
      return res.status(400).json({ success: false, message: '请填写用户名' });
    }
    if (!realName) {
      return res.status(400).json({ success: false, message: '请填写真实姓名' });
    }
    if (!teacherNo) {
      return res.status(400).json({ success: false, message: '请填写工号' });
    }
    if (!email) {
      return res.status(400).json({ success: false, message: '请填写邮箱' });
    }
    if (!department) {
      return res.status(400).json({ success: false, message: '请填写学院 / 部门' });
    }

    const fieldCheck = await validateAccountFields(
      { username, realName, teacherNo, phone, email, department },
      'teacher'
    );
    if (!fieldCheck.passed) {
      return res.status(400).json({
        success: false,
        message: fieldCheck.errors.map((e) => e.message).join('；'),
      });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }

    const [dupNo] = await pool.query(
      'SELECT id FROM users WHERE teacher_no = ? AND teacher_no IS NOT NULL LIMIT 1',
      [teacherNo]
    );
    if (dupNo.length) {
      return res.status(400).json({ success: false, message: '工号已存在' });
    }

    const [emailTaken] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (emailTaken.length > 0) {
      return res.status(400).json({ success: false, message: '该邮箱已被其他账号使用' });
    }

    const hp = await hashInitialTeacherPassword(teacherNo);
    if (!hp.ok) {
      return res.status(400).json({ success: false, message: hp.message });
    }

    const [result] = await pool.query(
      `INSERT INTO users
        (username, password, password_plain, real_name, teacher_no, phone, role, email, department, must_change_password)
       VALUES (?, ?, NULL, ?, ?, ?, 'teacher', ?, ?, 1)`,
      [username, hp.hash, realName, teacherNo, phone, email, department]
    );

    res.status(201).json({ success: true, message: '教师创建成功，初始密码为工号', userId: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const msg = String(error.sqlMessage || '');
      if (msg.includes('username')) {
        return res.status(400).json({ success: false, message: '用户名已存在' });
      }
      if (msg.includes('teacher_no')) {
        return res.status(400).json({ success: false, message: '工号已存在' });
      }
      if (msg.includes('email')) {
        return res.status(400).json({ success: false, message: '该邮箱已被其他账号使用' });
      }
      return res.status(400).json({ success: false, message: '数据重复（用户名、工号或邮箱已存在）' });
    }

    console.error('[createTeacher]', error);
    res.status(500).json({ success: false, message: '创建失败', error: error.message });
  }
};

const resetStudentInitialPassword = async (req, res) => {
  try {
    const targetId = toNumberOrNull(req.params.id);
    if (targetId == null) {
      return res.status(400).json({ success: false, message: '无效用户 ID' });
    }
    const [rows] = await pool.query(
      'SELECT id, role, student_no FROM users WHERE id = ? LIMIT 1',
      [targetId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    if (rows[0].role !== 'student') {
      return res.status(400).json({ success: false, message: '仅可重置学生账号密码' });
    }
    if (!rows[0].student_no) {
      return res.status(400).json({ success: false, message: '该学生无学号，无法重置为学号初始密码' });
    }
    const hp = await hashInitialStudentPassword(rows[0].student_no);
    if (!hp.ok) {
      return res.status(400).json({ success: false, message: hp.message });
    }
    await pool.query(
      `UPDATE users SET password = ?, password_plain = NULL, must_change_password = 1, password_changed_at = NULL WHERE id = ?`,
      [hp.hash, targetId]
    );
    try {
      await cache.invalidateUserMe(targetId);
    } catch {
      /* ignore */
    }
    res.json({ success: true, message: '已重置为学号初始密码，学生首次登录需修改密码' });
  } catch (error) {
    res.status(500).json({ success: false, message: '重置失败', error: error.message });
  }
};

const resetTeacherInitialPassword = async (req, res) => {
  try {
    const targetId = toNumberOrNull(req.params.id);
    if (targetId == null) {
      return res.status(400).json({ success: false, message: '无效用户 ID' });
    }
    const [rows] = await pool.query(
      'SELECT id, role, teacher_no FROM users WHERE id = ? LIMIT 1',
      [targetId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    if (rows[0].role !== 'teacher') {
      return res.status(400).json({ success: false, message: '仅可重置教师账号密码' });
    }
    if (!rows[0].teacher_no) {
      return res.status(400).json({ success: false, message: '该教师无工号，无法重置为工号初始密码' });
    }
    const hp = await hashInitialTeacherPassword(rows[0].teacher_no);
    if (!hp.ok) {
      return res.status(400).json({ success: false, message: hp.message });
    }
    await pool.query(
      `UPDATE users SET password = ?, password_plain = NULL, must_change_password = 1, password_changed_at = NULL WHERE id = ?`,
      [hp.hash, targetId]
    );
    try {
      await cache.invalidateUserMe(targetId);
    } catch {
      /* ignore */
    }
    res.json({ success: true, message: '已重置为工号初始密码，教师首次登录需修改密码' });
  } catch (error) {
    res.status(500).json({ success: false, message: '重置失败', error: error.message });
  }
};

const logout = async (req, res) => {
  try {
    const userId = toNumberOrNull(req.user?.id);
    const sessionId = req.user?.sessionId;
    if (userId == null) {
      return res.status(401).json({ success: false, message: '未授权访问' });
    }
    await logoutUserSession(pool, userId, sessionId);
    res.json({ success: true, message: '已退出登录' });
  } catch (error) {
    console.error('logout', error);
    res.status(500).json({ success: false, message: '退出失败，请稍后重试' });
  }
};

module.exports = {
  register,
  login,
  logout,
  getUserInfo,
  updateMyProfile,
  updateMyCredentials,
  getMyArchive,
  uploadMyAvatar,
  searchStudentsForClass,
  listAdminStudents,
  listAdminTeachers,
  createStudent,
  getAllUsers,
  getUserById,
  getAdminUserPassword,
  updateUser,
  deleteUser,
  resetStudentInitialPassword,
  resetTeacherInitialPassword,
  createTeacher,
  createEnterpriseUser,
  listEnterpriseUsers,
  getEnterpriseUserClasses,
  setEnterpriseUserClasses,
  getEnterpriseUserTeachingClasses,
  setEnterpriseUserTeachingClasses,
};