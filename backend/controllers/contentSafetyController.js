const pool = require('../config/database');
const { listAuditLogs, getAuditLogById, writeAuditLog } = require('../services/contentSafetyAuditService');
const { processKbDocument } = require('../controllers/kbController');

function parseJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

const listReviews = async (req, res) => {
  try {
    const { page, pageSize, status, riskLevel, targetType, q } = req.query;
    const st = status || 'pending_review';
    const data = await listAuditLogs({
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
      status: st,
      riskLevel: riskLevel || undefined,
      targetType: targetType || undefined,
      q: q || undefined,
    });
    res.json({ success: true, data: data.rows, total: data.total, page: data.page, pageSize: data.pageSize });
  } catch (error) {
    res.status(500).json({ success: false, message: '加载审核列表失败', error: error.message });
  }
};

const getReviewDetail = async (req, res) => {
  try {
    const row = await getAuditLogById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: '记录不存在' });
    res.json({
      success: true,
      data: {
        ...row,
        categories: parseJson(row.categories_json, []),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '加载详情失败', error: error.message });
  }
};

async function applyApproval(log, reviewerId, note) {
  const tt = log.target_type;
  const tid = log.target_id;
  if (tt === 'submission' && tid) {
    await pool.query(
      `UPDATE submissions SET safety_status = 'manual_approved', safety_reason = ?, safety_reviewed_by = ?, safety_reviewed_at = NOW() WHERE id = ?`,
      [note || log.reason, reviewerId, tid]
    );
  } else if (tt === 'kb_document' && tid) {
    await pool.query(
      `UPDATE kb_documents SET safety_status = 'manual_approved', safety_reason = ?, safety_reviewed_by = ?, safety_reviewed_at = NOW() WHERE id = ?`,
      [note || log.reason, reviewerId, tid]
    );
    setImmediate(() => processKbDocument(tid).catch(() => {}));
  }
}

async function applyRejection(log, reviewerId, note) {
  const tt = log.target_type;
  const tid = log.target_id;
  if (tt === 'submission' && tid) {
    await pool.query(
      `UPDATE submissions SET safety_status = 'manual_rejected', safety_reason = ?, safety_reviewed_by = ?, safety_reviewed_at = NOW() WHERE id = ?`,
      [note || log.reason, reviewerId, tid]
    );
  } else if (tt === 'kb_document' && tid) {
    await pool.query(
      `UPDATE kb_documents SET safety_status = 'manual_rejected', safety_reason = ?, safety_reviewed_by = ?, safety_reviewed_at = NOW(), status = 'failed', error_message = ? WHERE id = ?`,
      [note || log.reason, reviewerId, note || '内容安全审核未通过', tid]
    );
    await pool.query('DELETE FROM kb_chunks WHERE document_id = ?', [tid]);
  }
}

const approveReview = async (req, res) => {
  try {
    const note = String(req.body?.reviewNote || req.body?.note || '').trim();
    if (!note) return res.status(400).json({ success: false, message: '请填写审核意见' });
    const log = await getAuditLogById(req.params.id);
    if (!log) return res.status(404).json({ success: false, message: '记录不存在' });
    await applyApproval(log, req.user.id, note);
    await pool.query(
      `UPDATE content_safety_audit_logs SET status = 'manual_approved', reviewer_id = ?, review_note = ?, updated_at = NOW() WHERE id = ?`,
      [req.user.id, note, log.id]
    );
    res.json({ success: true, message: '已通过审核' });
  } catch (error) {
    res.status(500).json({ success: false, message: '审核失败', error: error.message });
  }
};

const rejectReview = async (req, res) => {
  try {
    const note = String(req.body?.reviewNote || req.body?.note || '').trim();
    if (!note) return res.status(400).json({ success: false, message: '请填写审核意见' });
    const log = await getAuditLogById(req.params.id);
    if (!log) return res.status(404).json({ success: false, message: '记录不存在' });
    await applyRejection(log, req.user.id, note);
    await pool.query(
      `UPDATE content_safety_audit_logs SET status = 'manual_rejected', reviewer_id = ?, review_note = ?, updated_at = NOW() WHERE id = ?`,
      [req.user.id, note, log.id]
    );
    res.json({ success: true, message: '已驳回' });
  } catch (error) {
    res.status(500).json({ success: false, message: '驳回失败', error: error.message });
  }
};

module.exports = {
  listReviews,
  getReviewDetail,
  approveReview,
  rejectReview,
};
