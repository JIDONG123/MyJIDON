const pool = require('../config/database');
const {
  teacherOwnsSubmissionTask,
  enterpriseOwnsSubmissionTask,
} = require('../utils/accessControl');

const ARCHIVED_REASON_LABELS = {
  teacher_return_resubmit: '教师退回后重交',
  resubmit: '重新提交',
};

function parseJsonField(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

function buildAttachmentsSummary(row) {
  const list = [];
  if (row.file_name) {
    list.push({
      fileName: row.file_name,
      fileType: null,
      label: '主附件',
    });
  }
  return list;
}

function mapGradingSnapshot(raw) {
  const snap = parseJsonField(raw);
  if (!snap) return null;
  return {
    totalScore: snap.total_score ?? null,
    humanScore: snap.human_score ?? null,
    finalScore: snap.final_score ?? null,
    enterpriseScore: snap.enterprise_score ?? null,
    status: snap.status ?? null,
    aiComment: snap.ai_comment ?? null,
    humanComment: snap.human_comment ?? null,
    gradedAt: snap.graded_at ?? null,
  };
}

async function assertCanViewSubmissionHistory(userId, role, submissionId) {
  const sid = Number(submissionId);
  const [rows] = await pool.query(
    `SELECT id, task_id, student_id, version, resubmit_status, submitted_at
     FROM submissions WHERE id = ?`,
    [sid]
  );
  const sub = rows[0];
  if (!sub) {
    const err = new Error('提交不存在');
    err.status = 404;
    throw err;
  }

  if (role === 'student') {
    if (Number(sub.student_id) !== Number(userId)) {
      const err = new Error('无权查看该提交历史');
      err.status = 403;
      throw err;
    }
  } else if (role === 'teacher') {
    const ok = await teacherOwnsSubmissionTask(userId, sid);
    if (!ok) {
      const err = new Error('无权查看该提交历史');
      err.status = 403;
      throw err;
    }
  } else if (role === 'enterprise') {
    const ok = await enterpriseOwnsSubmissionTask(userId, sid);
    if (!ok) {
      const err = new Error('无权查看该提交历史');
      err.status = 403;
      throw err;
    }
  } else if (role !== 'admin') {
    const err = new Error('权限不足');
    err.status = 403;
    throw err;
  }

  return sub;
}

async function resolveReturnReason(submissionId, archivedAt) {
  const [permRows] = await pool.query(
    `
    SELECT reason, remark, created_at
    FROM submission_resubmit_permissions
    WHERE submission_id = ?
      AND created_at <= DATE_ADD(?, INTERVAL 1 MINUTE)
    ORDER BY created_at DESC
    LIMIT 1
  `,
    [submissionId, archivedAt]
  );
  if (permRows[0]?.reason) {
    return permRows[0].remark
      ? `${permRows[0].reason}（${permRows[0].remark}）`
      : permRows[0].reason;
  }

  const [fbRows] = await pool.query(
    `
    SELECT reply_content, reject_reason
    FROM submission_feedbacks
    WHERE submission_id = ? AND status IN ('returned', 'rejected')
    ORDER BY handled_at DESC, id DESC
    LIMIT 1
  `,
    [submissionId]
  );
  if (fbRows[0]) {
    return fbRows[0].reply_content || fbRows[0].reject_reason || null;
  }
  return null;
}

async function listSubmissionHistory(submissionId, userId, role) {
  const sub = await assertCanViewSubmissionHistory(userId, role, submissionId);

  const [historyRows] = await pool.query(
    `
    SELECT id, submission_id, task_id, student_id, version,
           file_path, file_name, submission_text, code_content, code_language,
           content, grading_snapshot, archived_at, archived_reason
    FROM submission_history
    WHERE submission_id = ?
    ORDER BY version DESC, archived_at DESC
  `,
    [sub.id]
  );

  const items = [];
  for (const row of historyRows) {
    const returnReason = await resolveReturnReason(sub.id, row.archived_at);
    items.push({
      id: row.id,
      version: Number(row.version) || 1,
      archivedAt: row.archived_at,
      submissionText: row.submission_text || '',
      codeContent: row.code_content || '',
      codeLanguage: row.code_language || null,
      attachmentsSummary: buildAttachmentsSummary(row),
      gradingSnapshot: mapGradingSnapshot(row.grading_snapshot),
      archivedReason: row.archived_reason || null,
      archivedReasonLabel: ARCHIVED_REASON_LABELS[row.archived_reason] || row.archived_reason || null,
      returnReason,
      resubmitStatus: 'archived',
      isHistorical: true,
    });
  }

  return {
    submissionId: Number(sub.id),
    currentVersion: Number(sub.version) || 1,
    currentResubmitStatus: sub.resubmit_status || 'normal',
    currentSubmittedAt: sub.submitted_at || null,
    currentLabel: '当前生效',
    items,
  };
}

module.exports = {
  listSubmissionHistory,
  assertCanViewSubmissionHistory,
};
