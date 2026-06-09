const { isCodeRunnerEnabled } = require('../utils/codeRunConfig');

/** CODE_RUNNER_ENABLED=0 时返回 503，不影响其他 API */
function requireCodeRunnerEnabled(req, res, next) {
  if (!isCodeRunnerEnabled()) {
    return res.status(503).json({
      success: false,
      message: '代码运行功能未启用',
      code: 'CODE_RUNNER_DISABLED',
    });
  }
  next();
}

module.exports = { requireCodeRunnerEnabled };
