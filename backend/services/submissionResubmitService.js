/**
 * 单学生重交授权与提交历史归档
 */
const pool = require('../config/database');

const FEEDBACK_TYPES = {
  score_question: '成绩疑问',
  request_resubmit: '申请重新提交',
  ai_grading_question: 'AI 批改疑问',
  teacher_comment: '教师评语疑问',
  file_error: '附件/代码提交错误',
  other: '其他问题',
};

const FEEDBACK_STATUS = {
  pending: '待处理',
  replied: '已回复',
  returned: '已退回',
  rejected: '已驳回',
  closed: '已关闭',
};

function normalizeFeedbackType(raw) {
  const t = String(raw || 'other').toLowerCase();
  return Object.prototype.hasOwnProperty.call(FEEDBACK_TYPES, t) ? t : 'other';
}

async function loadActiveResubmitPermission({ taskId, studentId, submissionId = null }) {
  const params = [Number(taskId), Number(studentId)];
  let sql = `
    SELECT * FROM submission_resubmit_permissions
    WHERE task_id = ? AND student_id = ? AND status = 'active'
  `;
  if (submissionId != null) {
    sql += ' AND submission_id = ?';
    params.push(Number(submissionId));
  }
  sql += ' ORDER BY id DESC LIMIT 1';
  const [rows] = await pool.query(sql, params);
  const row = rows[0];
  if (!row) return null;
  if (row.expire_at) {
    const exp = new Date(row.expire_at);
    if (!Number.isNaN(exp.getTime()) && Date.now() > exp.getTime()) {
      await pool.query(
        `UPDATE submission_resubmit_permissions SET status = 'expired', updated_at = NOW() WHERE id = ?`,
        [row.id]
      );
      return null;
    }
  }
  if (Number(row.used_attempts) >= Number(row.extra_attempts)) {
    await pool.query(
      `UPDATE submission_resubmit_permissions SET status = 'used', updated_at = NOW() WHERE id = ?`,
      [row.id]
    );
    return null;
  }
  return row;
}

/**
 * @returns {{ ok: boolean, permission?: object, reason?: string }}
 */
async function evaluateResubmitSlot({ taskId, studentId, submissionId, usedCount, maxSubmissions }) {
  if (usedCount < maxSubmissions) {
    return { ok: true, via: 'task_limit' };
  }
  const perm = await loadActiveResubmitPermission({ taskId, studentId, submissionId });
  if (!perm) {
    return { ok: false, reason: '已达到最大提交次数，无法再次提交' };
  }
  return { ok: true, via: 'resubmit_permission', permission: perm };
}

async function archiveSubmissionSnapshot(submissionId, reason = 'resubmit') {
  const [subRows] = await pool.query('SELECT * FROM submissions WHERE id = ?', [submissionId]);
  const sub = subRows[0];
  if (!sub) return null;

  const [grRows] = await pool.query('SELECT * FROM grading_results WHERE submission_id = ?', [submissionId]);
  const gr = grRows[0] || null;
  const version = Number(sub.version) || 1;

  const gradingSnapshot = gr
    ? {
        total_score: gr.total_score,
        human_score: gr.human_score,
        final_score: gr.final_score,
        enterprise_score: gr.enterprise_score,
        ai_comment: gr.ai_comment,
        human_comment: gr.human_comment,
        status: gr.status,
        dimension_scores: gr.dimension_scores,
        verification_result: gr.verification_result,
        graded_at: gr.graded_at,
      }
    : null;

  const [ins] = await pool.query(
    `INSERT INTO submission_history
      (submission_id, task_id, student_id, version, file_path, file_name,
       submission_text, code_content, code_language, content, grading_snapshot, archived_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      submissionId,
      sub.task_id,
      sub.student_id,
      version,
      sub.file_path,
      sub.file_name,
      sub.submission_text,
      sub.code_content,
      sub.code_language,
      sub.content,
      gradingSnapshot ? JSON.stringify(gradingSnapshot) : null,
      reason,
    ]
  );

  await pool.query('UPDATE submissions SET version = version + 1 WHERE id = ?', [submissionId]);
  return { historyId: ins.insertId, version };
}

async function resetGradingForResubmit(submissionId) {
  const [gr] = await pool.query('SELECT id FROM grading_results WHERE submission_id = ?', [submissionId]);
  if (!gr.length) {
    await pool.query(
      `INSERT INTO grading_results (submission_id, status) VALUES (?, 'pending')`,
      [submissionId]
    );
    return;
  }
  await pool.query(
    `UPDATE grading_results SET
       total_score = NULL, dimension_scores = NULL, ai_comment = NULL, ai_problems = NULL,
       ai_suggestions = NULL, verification_result = NULL, verification_teacher_override = NULL,
       final_score = NULL, human_score = NULL, human_comment = NULL,
       status = 'pending', ai_batch_id = NULL, graded_at = NULL
     WHERE submission_id = ?`,
    [submissionId]
  );
}

async function consumeResubmitPermission(permissionId) {
  const [rows] = await pool.query('SELECT * FROM submission_resubmit_permissions WHERE id = ?', [permissionId]);
  const perm = rows[0];
  if (!perm) return;
  const used = Number(perm.used_attempts) + 1;
  const extra = Number(perm.extra_attempts);
  const status = used >= extra ? 'used' : 'active';
  await pool.query(
    `UPDATE submission_resubmit_permissions SET used_attempts = ?, status = ?, updated_at = NOW() WHERE id = ?`,
    [used, status, permissionId]
  );
}

async function createResubmitPermission({
  taskId,
  studentId,
  submissionId,
  feedbackId,
  grantedBy,
  reason,
  extraAttempts = 1,
  expireAt = null,
  keepHistory = true,
  remark = null,
}) {
  await pool.query(
    `UPDATE submission_resubmit_permissions SET status = 'cancelled', updated_at = NOW()
     WHERE task_id = ? AND student_id = ? AND status = 'active'`,
    [taskId, studentId]
  );
  const [ins] = await pool.query(
    `INSERT INTO submission_resubmit_permissions
      (task_id, student_id, submission_id, feedback_id, granted_by, reason,
       extra_attempts, expire_at, keep_history, remark, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      taskId,
      studentId,
      submissionId,
      feedbackId,
      grantedBy,
      reason,
      Math.max(1, Number(extraAttempts) || 1),
      expireAt || null,
      keepHistory ? 1 : 0,
      remark,
    ]
  );
  await pool.query(`UPDATE submissions SET resubmit_status = 'returned' WHERE id = ?`, [submissionId]);
  return ins.insertId;
}

async function getFeedbackSummaryForSubmissions(submissionIds) {
  if (!submissionIds.length) return new Map();
  const placeholders = submissionIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `
    SELECT submission_id,
           MAX(id) AS latest_feedback_id,
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
           (
             SELECT status FROM submission_feedbacks sf2
             WHERE sf2.submission_id = sf.submission_id
             ORDER BY sf2.id DESC LIMIT 1
           ) AS latest_status
    FROM submission_feedbacks sf
    WHERE submission_id IN (${placeholders})
    GROUP BY submission_id
  `,
    submissionIds
  );
  const map = new Map();
  for (const row of rows) {
    map.set(Number(row.submission_id), {
      feedbackStatus: row.latest_status || null,
      feedbackCount: Number(row.pending_count) || 0,
      latestFeedbackId: row.latest_feedback_id,
    });
  }
  return map;
}

module.exports = {
  FEEDBACK_TYPES,
  FEEDBACK_STATUS,
  normalizeFeedbackType,
  loadActiveResubmitPermission,
  evaluateResubmitSlot,
  archiveSubmissionSnapshot,
  resetGradingForResubmit,
  consumeResubmitPermission,
  createResubmitPermission,
  getFeedbackSummaryForSubmissions,
};
