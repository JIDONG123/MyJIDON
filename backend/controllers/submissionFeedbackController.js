const feedbackService = require('../services/submissionFeedbackService');

function handleError(res, error) {
  const status = error.status || 500;
  res.status(status).json({ success: false, message: error.message || '操作失败', error: error.message });
}

const createFeedback = async (req, res) => {
  try {
    const { submissionId, feedbackType, content, wantsResubmit, contactNote } = req.body;
    if (!submissionId) {
      return res.status(400).json({ success: false, message: '缺少 submissionId' });
    }
    const row = await feedbackService.createFeedback({
      submissionId,
      studentId: req.user.id,
      feedbackType,
      content,
      wantsResubmit: Boolean(wantsResubmit),
      contactNote,
    });
    res.json({ success: true, message: '反馈已提交', data: row });
  } catch (e) {
    handleError(res, e);
  }
};

const listMyFeedbacks = async (req, res) => {
  try {
    const rows = await feedbackService.listMyFeedbacks({
      studentId: req.user.id,
      submissionId: req.query.submissionId,
      taskId: req.params.taskId || req.query.taskId,
    });
    res.json({ success: true, data: rows });
  } catch (e) {
    handleError(res, e);
  }
};

const listTeacherFeedbacks = async (req, res) => {
  try {
    const data = await feedbackService.listTeacherFeedbacks({
      userId: req.user.id,
      role: req.user.role,
      status: req.query.status,
      taskId: req.query.taskId,
      classId: req.query.classId,
      keyword: req.query.keyword || req.query.q,
      feedbackType: req.query.feedbackType,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

const getFeedbackDetail = async (req, res) => {
  try {
    const fb = await feedbackService.assertTeacherCanHandleFeedback(
      req.user.id,
      req.user.role,
      req.params.id
    );
    res.json({ success: true, data: fb });
  } catch (e) {
    handleError(res, e);
  }
};

const replyFeedback = async (req, res) => {
  try {
    const row = await feedbackService.replyFeedback({
      feedbackId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
      replyContent: req.body.replyContent ?? req.body.content,
    });
    res.json({ success: true, message: '已回复', data: row });
  } catch (e) {
    handleError(res, e);
  }
};

const returnForResubmit = async (req, res) => {
  try {
    const row = await feedbackService.returnForResubmit({
      feedbackId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
      reason: req.body.reason,
      extraAttempts: req.body.extraAttempts ?? req.body.extra_attempts ?? 1,
      expireAt: req.body.expireAt ?? req.body.expire_at ?? null,
      keepHistory: req.body.keepHistory ?? req.body.keep_history ?? true,
      remark: req.body.remark ?? null,
    });
    res.json({ success: true, message: '已退回并授权重交', data: row });
  } catch (e) {
    handleError(res, e);
  }
};

const rejectFeedback = async (req, res) => {
  try {
    const row = await feedbackService.rejectFeedback({
      feedbackId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
      rejectReason: req.body.rejectReason ?? req.body.reason,
    });
    res.json({ success: true, message: '已驳回', data: row });
  } catch (e) {
    handleError(res, e);
  }
};

const closeFeedback = async (req, res) => {
  try {
    const row = await feedbackService.closeFeedback({
      feedbackId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
    });
    res.json({ success: true, message: '已关闭', data: row });
  } catch (e) {
    handleError(res, e);
  }
};

const getMeta = async (_req, res) => {
  res.json({
    success: true,
    data: {
      feedbackTypes: feedbackService.FEEDBACK_TYPES,
      feedbackStatus: feedbackService.FEEDBACK_STATUS,
    },
  });
};

module.exports = {
  createFeedback,
  listMyFeedbacks,
  listTeacherFeedbacks,
  getFeedbackDetail,
  replyFeedback,
  returnForResubmit,
  rejectFeedback,
  closeFeedback,
  getMeta,
};
