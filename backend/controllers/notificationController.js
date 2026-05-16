const pool = require('../config/database');

function toNumberOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isNotificationsMissing(err) {
  const msg = String(err?.sqlMessage || err?.message || '').toLowerCase();
  return (
    err?.code === 'ER_NO_SUCH_TABLE' ||
    err?.errno === 1146 ||
    msg.includes("doesn't exist")
  );
}

const listNotifications = async (req, res) => {
  try {
    const uid = toNumberOrNull(req.user?.id);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;

    const [rows] = await pool.query(
      `SELECT id, type, title, body, ref_type, ref_id, is_read, created_at
       FROM notifications WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [uid, pageSize, offset]
    );
    const [cnt] = await pool.query(`SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?`, [uid]);
    const total = toNumberOrNull(cnt[0]?.total) ?? 0;

    res.json({ success: true, data: rows, total, page, pageSize });
  } catch (error) {
    if (isNotificationsMissing(error)) {
      return res.json({ success: true, data: [], total: 0, page: 1, pageSize: 20 });
    }
    res.status(500).json({ success: false, message: '获取通知失败', error: error.message });
  }
};

const unreadCount = async (req, res) => {
  try {
    const uid = toNumberOrNull(req.user?.id);
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0`,
      [uid]
    );
    res.json({ success: true, count: toNumberOrNull(rows[0]?.n) ?? 0 });
  } catch (error) {
    if (isNotificationsMissing(error)) {
      return res.json({ success: true, count: 0 });
    }
    res.status(500).json({ success: false, message: '获取未读数失败', error: error.message });
  }
};

const markRead = async (req, res) => {
  try {
    const uid = toNumberOrNull(req.user?.id);
    const id = toNumberOrNull(req.params.id);
    await pool.query(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, [id, uid]);
    res.json({ success: true });
  } catch (error) {
    if (isNotificationsMissing(error)) {
      return res.json({ success: true });
    }
    res.status(500).json({ success: false, message: '操作失败', error: error.message });
  }
};

const markAllRead = async (req, res) => {
  try {
    const uid = toNumberOrNull(req.user?.id);
    await pool.query(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`, [uid]);
    res.json({ success: true });
  } catch (error) {
    if (isNotificationsMissing(error)) {
      return res.json({ success: true });
    }
    res.status(500).json({ success: false, message: '操作失败', error: error.message });
  }
};

module.exports = {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
};
