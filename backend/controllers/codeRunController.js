const codeRunService = require('../services/codeRunService');

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
    const data = await codeRunService.createJobFromBody(req.body, req.user.id, req.user.role);
    res.status(202).json({
      success: true,
      message: '代码运行任务已入队',
      data,
    });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const listJobs = async (req, res) => {
  try {
    const result = await codeRunService.listJobs(req.query, req.user.id, req.user.role);
    res.json({ success: true, ...result });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const getJob = async (req, res) => {
  try {
    const data = await codeRunService.getJobDetail(req.params.id, req.user.id, req.user.role);
    res.json({ success: true, data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const getJobResult = async (req, res) => {
  try {
    const data = await codeRunService.getJobResult(req.params.id, req.user.id, req.user.role);
    res.json({ success: true, data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

const cancelJob = async (req, res) => {
  try {
    const data = await codeRunService.cancelJob(req.params.id, req.user.id, req.user.role);
    res.json({ success: true, message: '任务已取消', data });
  } catch (e) {
    handleServiceError(res, e);
  }
};

module.exports = {
  createJob,
  listJobs,
  getJob,
  getJobResult,
  cancelJob,
};
