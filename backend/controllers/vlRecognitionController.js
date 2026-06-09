const pool = require('../config/database');
const {
  getVlRecognitionBySubmissionId,
  rerunVlForSubmission,
} = require('../services/vlRecognitionService');
const {
  teacherOwnsSubmissionTask,
  enterpriseOwnsSubmissionTask,
} = require('../utils/accessControl');

async function loadSubmissionAccess(submissionId, user) {
  const [rows] = await pool.query(
    `SELECT s.id, s.student_id, s.task_id, t.class_id
     FROM submissions s
     JOIN tasks t ON t.id = s.task_id
     WHERE s.id = ? LIMIT 1`,
    [submissionId]
  );
  if (!rows.length) return { ok: false, status: 404, message: '提交不存在' };
  const row = rows[0];

  if (user.role === 'student') {
    if (Number(row.student_id) !== Number(user.id)) {
      return { ok: false, status: 403, message: '无权查看该提交' };
    }
    return { ok: true, row };
  }
  if (user.role === 'teacher') {
    const ok = await teacherOwnsSubmissionTask(user.id, submissionId);
    if (!ok) return { ok: false, status: 403, message: '无权操作该提交' };
    return { ok: true, row };
  }
  if (user.role === 'enterprise') {
    const ok = await enterpriseOwnsSubmissionTask(user.id, submissionId);
    if (!ok) return { ok: false, status: 403, message: '无权操作该提交' };
    return { ok: true, row };
  }
  if (user.role === 'admin') {
    return { ok: true, row };
  }
  return { ok: false, status: 403, message: '无权操作' };
}

const getVlRecognition = async (req, res) => {
  try {
    const submissionId = req.params.id;
    const access = await loadSubmissionAccess(submissionId, req.user);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }
    const data = await getVlRecognitionBySubmissionId(submissionId);
    res.json({ success: true, data: data || { status: 'none' } });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取视觉识别结果失败',
      error: error.message,
    });
  }
};

const postVlRecognize = async (req, res) => {
  try {
    const submissionId = req.params.id;
    const access = await loadSubmissionAccess(submissionId, req.user);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    if (req.user.role === 'student' && Number(access.row.student_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: '无权操作' });
    }

    const progressMeta = {
      classId: access.row.class_id,
      taskId: access.row.task_id,
      studentId: access.row.student_id,
      submissionId: Number(submissionId),
    };

    const result = await rerunVlForSubmission(submissionId, progressMeta);
    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message });
    }
    res.json({ success: true, message: '视觉识别已完成', data: result.data });
  } catch (error) {
    const msg = error && error.message ? error.message : '视觉识别失败';
    const timeout = /超时|timeout|abort/i.test(msg);
    res.status(timeout ? 504 : 500).json({
      success: false,
      message: msg,
      error: error.message,
    });
  }
};

module.exports = {
  getVlRecognition,
  postVlRecognize,
};
