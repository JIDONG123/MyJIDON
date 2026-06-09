const pool = require('../config/database');
const { detectTextSafety } = require('./contentSafetyService');
const { notifyUser, safeNotify } = require('../utils/notify');
const { teacherOwnsSubmissionTask, teacherOwnsTaskForGrading } = require('../utils/accessControl');
const {
  FEEDBACK_TYPES,
  FEEDBACK_STATUS,
  normalizeFeedbackType,
  createResubmitPermission,
  loadActiveResubmitPermission,
} = require('./submissionResubmitService');

function stripHtml(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

async function assertStudentOwnsSubmission(studentId, submissionId) {
  const [rows] = await pool.query(
    'SELECT id, task_id, student_id FROM submissions WHERE id = ? AND student_id = ?',
    [submissionId, studentId]
  );
  return rows[0] || null;
}

async function loadFeedbackById(id) {
  const [rows] = await pool.query(
    `
    SELECT f.*, t.title AS task_title, u.real_name AS student_name, u.student_no,
           c.class_name, h.real_name AS handler_name
    FROM submission_feedbacks f
    INNER JOIN tasks t ON t.id = f.task_id
    INNER JOIN users u ON u.id = f.student_id
    LEFT JOIN classes c ON c.id = u.class_id
    LEFT JOIN users h ON h.id = f.handled_by
    WHERE f.id = ?
  `,
    [id]
  );
  return rows[0] || null;
}

async function assertTeacherCanHandleFeedback(teacherId, role, feedbackId) {
  const fb = await loadFeedbackById(feedbackId);
  if (!fb) {
    const err = new Error('反馈不存在');
    err.status = 404;
    throw err;
  }
  if (role === 'admin') return fb;
  const ok = await teacherOwnsSubmissionTask(teacherId, fb.submission_id);
  if (!ok) {
    const err = new Error('无权处理该反馈');
    err.status = 403;
    throw err;
  }
  return fb;
}

async function createFeedback({ submissionId, studentId, feedbackType, content, wantsResubmit, contactNote }) {
  const sub = await assertStudentOwnsSubmission(studentId, submissionId);
  if (!sub) {
    const err = new Error('提交不存在或无权反馈');
    err.status = 403;
    throw err;
  }

  const body = stripHtml(content);
  if (!body) {
    const err = new Error('反馈内容不能为空');
    err.status = 400;
    throw err;
  }

  const [pendingRows] = await pool.query(
    `SELECT id FROM submission_feedbacks WHERE submission_id = ? AND status = 'pending' LIMIT 1`,
    [submissionId]
  );
  if (pendingRows.length) {
    const err = new Error('该提交已有待处理反馈，请等待教师处理后再提交');
    err.status = 409;
    throw err;
  }

  const safety = await detectTextSafety(body, { scene: 'submission_feedback', userId: studentId });
  if (!safety.passed) {
    const err = new Error(safety.reason || '反馈内容未通过安全检测');
    err.status = 400;
    throw err;
  }

  const type = normalizeFeedbackType(feedbackType);
  const [taskRows] = await pool.query('SELECT created_by, title FROM tasks WHERE id = ?', [sub.task_id]);
  const task = taskRows[0];

  const [ins] = await pool.query(
    `INSERT INTO submission_feedbacks
      (task_id, submission_id, student_id, teacher_id, feedback_type, content,
       wants_resubmit, contact_note, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      sub.task_id,
      submissionId,
      studentId,
      task?.created_by || null,
      type,
      body,
      wantsResubmit ? 1 : 0,
      contactNote ? stripHtml(contactNote).slice(0, 500) : null,
    ]
  );

  const feedbackId = ins.insertId;
  const [studentRows] = await pool.query('SELECT real_name FROM users WHERE id = ?', [studentId]);
  const studentName = studentRows[0]?.real_name || '学生';
  const taskTitle = task?.title || '实训任务';

  if (task?.created_by) {
    safeNotify(
      notifyUser(task.created_by, {
        type: 'submission_feedback',
        title: '学生提交了作业反馈',
        body: `学生【${studentName}】对任务【${taskTitle}】提交了作业反馈，请及时处理。`,
        refType: 'submission_feedback',
        refId: feedbackId,
      })
    );
  }

  return loadFeedbackById(feedbackId);
}

async function listMyFeedbacks({ studentId, submissionId, taskId }) {
  const params = [studentId];
  let where = 'f.student_id = ?';
  if (submissionId) {
    where += ' AND f.submission_id = ?';
    params.push(Number(submissionId));
  }
  if (taskId) {
    where += ' AND f.task_id = ?';
    params.push(Number(taskId));
  }
  const [rows] = await pool.query(
    `
    SELECT f.*, t.title AS task_title
    FROM submission_feedbacks f
    INNER JOIN tasks t ON t.id = f.task_id
    WHERE ${where}
    ORDER BY f.id DESC
  `,
    params
  );
  return rows;
}

async function listTeacherFeedbacks({
  userId,
  role,
  status,
  taskId,
  classId,
  keyword,
  feedbackType,
  page = 1,
  pageSize = 20,
}) {
  const limit = Math.min(100, Math.max(1, pageSize));
  const offset = (Math.max(1, page) - 1) * limit;
  const params = [];
  let where = '1=1';

  if (role === 'teacher') {
    where += ' AND t.created_by = ?';
    params.push(userId);
  } else if (role !== 'admin') {
    return { rows: [], total: 0, page, pageSize: limit };
  }

  if (status && status !== 'all') {
    where += ' AND f.status = ?';
    params.push(status);
  }
  if (taskId) {
    where += ' AND f.task_id = ?';
    params.push(Number(taskId));
  }
  if (classId) {
    where += ' AND u.class_id = ?';
    params.push(Number(classId));
  }
  if (feedbackType) {
    where += ' AND f.feedback_type = ?';
    params.push(normalizeFeedbackType(feedbackType));
  }
  if (keyword) {
    where += ' AND (u.real_name LIKE ? OR u.student_no LIKE ? OR f.content LIKE ?)';
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }

  const [countRows] = await pool.query(
    `
    SELECT COUNT(*) AS c
    FROM submission_feedbacks f
    INNER JOIN tasks t ON t.id = f.task_id
    INNER JOIN users u ON u.id = f.student_id
    WHERE ${where}
  `,
    params
  );
  const total = Number(countRows[0]?.c) || 0;

  const [rows] = await pool.query(
    `
    SELECT f.*, t.title AS task_title, u.real_name AS student_name, u.student_no, c.class_name
    FROM submission_feedbacks f
    INNER JOIN tasks t ON t.id = f.task_id
    INNER JOIN users u ON u.id = f.student_id
    LEFT JOIN classes c ON c.id = u.class_id
    WHERE ${where}
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `,
    [...params, limit, offset]
  );

  return { rows, total, page, pageSize: limit };
}

async function replyFeedback({ feedbackId, userId, role, replyContent }) {
  const fb = await assertTeacherCanHandleFeedback(userId, role, feedbackId);
  const body = stripHtml(replyContent);
  if (!body) {
    const err = new Error('回复内容不能为空');
    err.status = 400;
    throw err;
  }
  const safety = await detectTextSafety(body, { scene: 'submission_feedback_reply', userId });
  if (!safety.passed) {
    const err = new Error(safety.reason || '回复内容未通过安全检测');
    err.status = 400;
    throw err;
  }

  await pool.query(
    `UPDATE submission_feedbacks SET status = 'replied', reply_content = ?, handled_by = ?, handled_at = NOW() WHERE id = ?`,
    [body, userId, feedbackId]
  );

  safeNotify(
    notifyUser(fb.student_id, {
      type: 'submission_feedback_reply',
      title: '教师回复了你的作业反馈',
      body: `教师已回复你对【${fb.task_title || '实训任务'}】的作业反馈。`,
      refType: 'submission_feedback',
      refId: feedbackId,
    })
  );

  return loadFeedbackById(feedbackId);
}

async function returnForResubmit({
  feedbackId,
  userId,
  role,
  reason,
  extraAttempts = 1,
  expireAt = null,
  keepHistory = true,
  remark = null,
}) {
  const fb = await assertTeacherCanHandleFeedback(userId, role, feedbackId);
  const retReason = stripHtml(reason);
  if (!retReason) {
    const err = new Error('退回原因不能为空');
    err.status = 400;
    throw err;
  }

  await createResubmitPermission({
    taskId: fb.task_id,
    studentId: fb.student_id,
    submissionId: fb.submission_id,
    feedbackId,
    grantedBy: userId,
    reason: retReason,
    extraAttempts,
    expireAt,
    keepHistory,
    remark,
  });

  await pool.query(
    `UPDATE submission_feedbacks SET status = 'returned', reply_content = ?, handled_by = ?, handled_at = NOW() WHERE id = ?`,
    [retReason, userId, feedbackId]
  );

  const expireHint = expireAt ? `请在 ${expireAt} 前重新提交。` : '请尽快重新提交。';
  safeNotify(
    notifyUser(fb.student_id, {
      type: 'submission_returned',
      title: '教师已退回你的作业',
      body: `教师已退回你在【${fb.task_title || '实训任务'}】中的作业，${expireHint}`,
      refType: 'submission',
      refId: fb.submission_id,
    })
  );

  return loadFeedbackById(feedbackId);
}

async function rejectFeedback({ feedbackId, userId, role, rejectReason }) {
  const fb = await assertTeacherCanHandleFeedback(userId, role, feedbackId);
  const reason = stripHtml(rejectReason);
  if (!reason) {
    const err = new Error('驳回原因不能为空');
    err.status = 400;
    throw err;
  }

  await pool.query(
    `UPDATE submission_feedbacks SET status = 'rejected', reject_reason = ?, reply_content = ?, handled_by = ?, handled_at = NOW() WHERE id = ?`,
    [reason, reason, userId, feedbackId]
  );

  safeNotify(
    notifyUser(fb.student_id, {
      type: 'submission_feedback_rejected',
      title: '你的作业反馈已被驳回',
      body: `教师驳回了你对【${fb.task_title || '实训任务'}】的作业反馈：${reason}`,
      refType: 'submission_feedback',
      refId: feedbackId,
    })
  );

  return loadFeedbackById(feedbackId);
}

async function closeFeedback({ feedbackId, userId, role }) {
  await assertTeacherCanHandleFeedback(userId, role, feedbackId);
  await pool.query(
    `UPDATE submission_feedbacks SET status = 'closed', handled_by = ?, handled_at = NOW() WHERE id = ?`,
    [userId, feedbackId]
  );
  return loadFeedbackById(feedbackId);
}

async function getStudentResubmitState({ studentId, taskId, submissionId }) {
  const perm = await loadActiveResubmitPermission({ taskId, studentId, submissionId });
  const [subRows] = await pool.query(
    'SELECT resubmit_status FROM submissions WHERE id = ? AND student_id = ?',
    [submissionId, studentId]
  );
  return {
    resubmitStatus: subRows[0]?.resubmit_status || 'normal',
    activePermission: perm
      ? {
          id: perm.id,
          extraAttempts: perm.extra_attempts,
          usedAttempts: perm.used_attempts,
          expireAt: perm.expire_at,
          reason: perm.reason,
        }
      : null,
  };
}

module.exports = {
  FEEDBACK_TYPES,
  FEEDBACK_STATUS,
  createFeedback,
  listMyFeedbacks,
  listTeacherFeedbacks,
  loadFeedbackById,
  replyFeedback,
  returnForResubmit,
  rejectFeedback,
  closeFeedback,
  getStudentResubmitState,
  assertTeacherCanHandleFeedback,
};
