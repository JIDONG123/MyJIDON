const pool = require('../config/database');
const { getStudentClassId, teacherManagesClass } = require('../utils/accessControl');
const rt = require('../utils/realtimeEmit');

function toNumberOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isAnnounceTableMissing(err) {
  const msg = String(err?.sqlMessage || err?.message || '').toLowerCase();
  return err?.code === 'ER_NO_SUCH_TABLE' || err?.errno === 1146 || msg.includes("doesn't exist");
}

const listAnnouncements = async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const uid = req.user.id;
    const role = req.user.role;

    if (role === 'student') {
      const scid = await getStudentClassId(uid);
      if (scid == null || Number(scid) !== classId) {
        return res.status(403).json({ success: false, message: '无权查看该班级公告' });
      }
    } else if (role === 'teacher') {
      const ok = await teacherManagesClass(uid, classId);
      if (!ok) return res.status(403).json({ success: false, message: '无权查看该班级公告' });
    } else if (role !== 'admin') {
      return res.status(403).json({ success: false, message: '无权查看该班级公告' });
    }

    const [rows] = await pool.query(
      `SELECT a.id, a.class_id, a.teacher_id, a.title, a.content, a.created_at, a.updated_at,
              u.real_name AS teacher_name
       FROM class_announcements a
       LEFT JOIN users u ON a.teacher_id = u.id
       WHERE a.class_id = ?
       ORDER BY a.created_at DESC`,
      [classId]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    if (isAnnounceTableMissing(error)) {
      return res.json({ success: true, data: [] });
    }
    res.status(500).json({ success: false, message: '获取公告失败', error: error.message });
  }
};

const createAnnouncement = async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const { title, content } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, message: '请填写公告标题' });
    }
    const ok = await teacherManagesClass(req.user.id, classId);
    if (!ok) {
      return res.status(403).json({ success: false, message: '只能向自己负责的班级发布公告' });
    }
    const [result] = await pool.query(
      `INSERT INTO class_announcements (class_id, teacher_id, title, content) VALUES (?, ?, ?, ?)`,
      [classId, req.user.id, String(title).trim(), content != null ? String(content) : null]
    );
    res.status(201).json({ success: true, message: '公告已发布', id: result.insertId });
    try {
      rt.emitAnnouncements(classId, { announcementId: result.insertId });
    } catch {
      /* ignore */
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '发布失败', error: error.message });
  }
};

const updateAnnouncement = async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const annId = Number(req.params.announcementId);
    const { title, content } = req.body;

    const ok = await teacherManagesClass(req.user.id, classId);
    if (!ok) {
      return res.status(403).json({ success: false, message: '无权修改该班级公告' });
    }

    const [rows] = await pool.query(
      `SELECT id, teacher_id FROM class_announcements WHERE id = ? AND class_id = ?`,
      [annId, classId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '公告不存在' });
    }
    if (Number(rows[0].teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: '只能编辑本人发布的公告' });
    }

    const t = title !== undefined ? String(title).trim() : null;
    if (t !== null && !t) {
      return res.status(400).json({ success: false, message: '标题不能为空' });
    }

    const fields = [];
    const params = [];
    if (t !== null) {
      fields.push('title = ?');
      params.push(t);
    }
    if (content !== undefined) {
      fields.push('content = ?');
      params.push(content != null ? String(content) : null);
    }
    if (!fields.length) {
      return res.json({ success: true, message: '无变更' });
    }
    params.push(annId);
    await pool.query(`UPDATE class_announcements SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, message: '已更新' });
    try {
      rt.emitAnnouncements(classId, { announcementId: annId });
    } catch {
      /* ignore */
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败', error: error.message });
  }
};

const deleteAnnouncement = async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const annId = Number(req.params.announcementId);

    const ok = await teacherManagesClass(req.user.id, classId);
    if (!ok) {
      return res.status(403).json({ success: false, message: '无权删除该班级公告' });
    }

    const [rows] = await pool.query(
      `SELECT id, teacher_id FROM class_announcements WHERE id = ? AND class_id = ?`,
      [annId, classId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '公告不存在' });
    }
    if (Number(rows[0].teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: '只能删除本人发布的公告' });
    }

    await pool.query(`DELETE FROM class_announcements WHERE id = ?`, [annId]);
    res.json({ success: true, message: '已删除' });
    try {
      rt.emitAnnouncements(classId, { announcementId: annId, deleted: true });
    } catch {
      /* ignore */
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
};

/** 学生首页：本班最新一条公告 */
const getLatestForMyClass = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: '仅学生可访问' });
    }
    const cid = await getStudentClassId(req.user.id);
    if (cid == null) {
      return res.json({ success: true, data: null });
    }

    const [rows] = await pool.query(
      `SELECT a.id, a.title, a.content, a.created_at,
              u.real_name AS teacher_name
       FROM class_announcements a
       LEFT JOIN users u ON a.teacher_id = u.id
       WHERE a.class_id = ?
       ORDER BY a.created_at DESC
       LIMIT 1`,
      [cid]
    );
    res.json({ success: true, data: rows[0] || null });
  } catch (error) {
    if (isAnnounceTableMissing(error)) {
      return res.json({ success: true, data: null });
    }
    res.status(500).json({ success: false, message: '获取公告失败', error: error.message });
  }
};

module.exports = {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getLatestForMyClass,
};
