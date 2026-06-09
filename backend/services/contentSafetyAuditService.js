/**
 * 内容安全审计日志
 */
const pool = require('../config/database');

function toJson(v) {
  if (v == null) return null;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

async function writeAuditLog(entry = {}) {
  const [r] = await pool.query(
    `INSERT INTO content_safety_audit_logs
      (target_type, target_id, user_id, user_role, username, real_name, file_name, file_type, file_hash,
       risk_level, categories_json, reason, model_used, raw_result_json, status, reviewer_id, review_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.targetType || 'unknown',
      entry.targetId ?? null,
      entry.userId ?? null,
      entry.userRole ?? null,
      entry.username ? String(entry.username).slice(0, 100) : null,
      entry.realName ? String(entry.realName).slice(0, 100) : null,
      entry.fileName ? String(entry.fileName).slice(0, 255) : null,
      entry.fileType ? String(entry.fileType).slice(0, 64) : null,
      entry.fileHash ? String(entry.fileHash).slice(0, 128) : null,
      entry.riskLevel || 'safe',
      toJson(entry.categories || []),
      entry.reason ? String(entry.reason).slice(0, 500) : null,
      entry.modelUsed ? String(entry.modelUsed).slice(0, 64) : null,
      toJson(entry.rawResult),
      entry.status || 'passed',
      entry.reviewerId ?? null,
      entry.reviewNote ? String(entry.reviewNote).slice(0, 500) : null,
    ]
  );
  return r.insertId;
}

async function listAuditLogs({ page = 1, pageSize = 20, status, riskLevel, targetType, q }) {
  const limit = Math.min(100, Math.max(1, pageSize));
  const offset = (Math.max(1, page) - 1) * limit;
  const params = [];
  let where = '1=1';
  if (status) {
    where += ' AND status = ?';
    params.push(status);
  }
  if (riskLevel) {
    where += ' AND risk_level = ?';
    params.push(riskLevel);
  }
  if (targetType) {
    where += ' AND target_type = ?';
    params.push(targetType);
  }
  if (q) {
    where += ' AND (username LIKE ? OR file_name LIKE ? OR reason LIKE ?)';
    const like = `%${String(q).slice(0, 50)}%`;
    params.push(like, like, like);
  }
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS c FROM content_safety_audit_logs WHERE ${where}`,
    params
  );
  const [rows] = await pool.query(
    `SELECT id, target_type, target_id, user_id, user_role, username, real_name, file_name, file_type,
            file_hash, risk_level, categories_json, reason, model_used, status, reviewer_id, review_note,
            created_at, updated_at
     FROM content_safety_audit_logs WHERE ${where}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return { rows, total: countRows[0]?.c ?? 0, page, pageSize: limit };
}

async function getAuditLogById(id) {
  const [rows] = await pool.query('SELECT * FROM content_safety_audit_logs WHERE id = ?', [id]);
  return rows[0] || null;
}

module.exports = {
  writeAuditLog,
  listAuditLogs,
  getAuditLogById,
};
