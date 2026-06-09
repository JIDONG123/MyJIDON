const gradingJobService = require('../services/gradingJobService');

function handleServiceError(res, error) {
  const status = error.status || 500;
  res.status(status).json({
    success: false,
    message: error.message || '操作失败',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
}

const createJob = async (req, res) => {
  try {
    const data = await gradingJobService.createJobFromBody(req.body, req.user.id, req.user.role);
    res.status(201).json({
      success: true,
      message: data.deduped ? '该提交已在批改队列中' : '批改任务已创建',
      data,
    });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const listJobs = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const status = req.query.status || null;
    const result = await gradingJobService.listJobs({
      userId: req.user.id,
      role: req.user.role,
      page,
      pageSize,
      status,
    });
    res.json({ success: true, ...result });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const getJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    const detail = await gradingJobService.getJobDetail(jobId, req.user.id, req.user.role, {
      itemPage: parseInt(req.query.itemPage, 10) || 1,
      itemPageSize: parseInt(req.query.itemPageSize, 10) || 50,
    });
    res.json({ success: true, data: detail });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const cancelJob = async (req, res) => {
  try {
    const data = await gradingJobService.cancelJob(req.params.id, req.user.id, req.user.role);
    res.json({ success: true, message: '任务已取消', data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const retryJob = async (req, res) => {
  try {
    const data = await gradingJobService.retryFailedItems(req.params.id, req.user.id, req.user.role);
    res.json({
      success: true,
      message: data.retried ? `已重新入队 ${data.retried} 条失败项` : '没有可重试的失败项',
      data,
    });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const workerHealth = async (req, res) => {
  try {
    const data = await gradingJobService.getWorkerHealth();
    res.json({ success: true, data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

module.exports = {
  createJob,
  listJobs,
  getJob,
  cancelJob,
  retryJob,
  workerHealth,
};
