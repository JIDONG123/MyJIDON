const { isOnlinePracticeAiReviewEnabled } = require('../utils/onlinePracticeAiReviewConfig');

/** ONLINE_PRACTICE_AI_REVIEW_ENABLED=0 时 AI 点评 API 返回 503 */
function requireOnlinePracticeAiReviewEnabled(req, res, next) {
  if (!isOnlinePracticeAiReviewEnabled()) {
    return res.status(503).json({
      success: false,
      message: '在线实训 AI 代码点评未启用（ONLINE_PRACTICE_AI_REVIEW_ENABLED=0）',
      code: 'ONLINE_PRACTICE_AI_REVIEW_DISABLED',
    });
  }
  next();
}

module.exports = { requireOnlinePracticeAiReviewEnabled };
