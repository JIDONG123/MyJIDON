const onlinePracticeService = require('../services/onlinePracticeService');
const onlinePracticeAiReviewService = require('../services/onlinePracticeAiReviewService');

function handleServiceError(res, error) {
  const status = error.status || 500;
  res.status(status).json({
    success: false,
    message: error.message || '操作失败',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
}

const listTemplates = async (req, res) => {
  try {
    const result = await onlinePracticeService.listTemplates(req.query, req.user.id, req.user.role);
    res.json({ success: true, ...result });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const createTemplate = async (req, res) => {
  try {
    const data = await onlinePracticeService.createTemplate(req.body, req.user.id, req.user.role);
    res.status(201).json({ success: true, message: '创建成功', data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const getTemplate = async (req, res) => {
  try {
    const data = await onlinePracticeService.getTemplateDetail(req.params.id, req.user.id, req.user.role);
    res.json({ success: true, data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const updateTemplate = async (req, res) => {
  try {
    const data = await onlinePracticeService.updateTemplate(
      req.params.id,
      req.body,
      req.user.id,
      req.user.role
    );
    res.json({ success: true, message: '更新成功', data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const publishTemplate = async (req, res) => {
  try {
    const data = await onlinePracticeService.publishTemplate(req.params.id, req.user.id, req.user.role);
    res.json({ success: true, message: '已发布', data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const closeTemplate = async (req, res) => {
  try {
    const data = await onlinePracticeService.closeTemplate(req.params.id, req.user.id, req.user.role);
    res.json({ success: true, message: '已关闭', data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const openTemplate = async (req, res) => {
  try {
    const data = await onlinePracticeService.ensureAttempt(req.params.id, req.user.id);
    const aiStatus = await onlinePracticeAiReviewService.getAiReviewStatus();
    data.aiReview = {
      globalEnabled: aiStatus.globalEnabled,
      llmConfigured: aiStatus.llmConfigured,
      templateEnabled: Boolean(data.template?.aiReviewEnabled),
      available:
        aiStatus.globalEnabled &&
        aiStatus.llmConfigured &&
        Boolean(data.template?.aiReviewEnabled),
    };
    res.json({ success: true, data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const listMyAttempts = async (req, res) => {
  try {
    const result = await onlinePracticeService.listMyAttempts(req.user.id);
    res.json({ success: true, ...result });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const getAttempt = async (req, res) => {
  try {
    const data = await onlinePracticeService.getAttemptDetail(req.params.id, req.user.id);
    res.json({ success: true, data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const saveSource = async (req, res) => {
  try {
    const data = await onlinePracticeService.saveAttemptSource(
      req.params.id,
      req.user.id,
      req.body?.sourceCode
    );
    res.json({ success: true, message: '已保存', data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const runAttempt = async (req, res) => {
  try {
    const data = await onlinePracticeService.runAttempt(req.params.id, req.user.id, req.body);
    res.status(202).json({ success: true, message: '代码运行任务已入队', data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const getAiReviewStatus = async (req, res) => {
  try {
    const data = await onlinePracticeAiReviewService.getAiReviewStatus();
    res.json({ success: true, data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const getLatestAiReview = async (req, res) => {
  try {
    const data = await onlinePracticeAiReviewService.getLatestReview(req.params.id, req.user.id);
    res.json({ success: true, data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const createAiReview = async (req, res) => {
  try {
    const data = await onlinePracticeAiReviewService.createAiReview(
      req.params.id,
      req.user.id,
      req.body
    );
    res.json({ success: true, message: 'AI 代码规范参考点评已完成', data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

module.exports = {
  listTemplates,
  createTemplate,
  getTemplate,
  updateTemplate,
  publishTemplate,
  closeTemplate,
  openTemplate,
  listMyAttempts,
  getAttempt,
  saveSource,
  runAttempt,
  getAiReviewStatus,
  getLatestAiReview,
  createAiReview,
};
