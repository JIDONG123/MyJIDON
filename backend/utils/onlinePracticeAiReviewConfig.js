/** 在线实训 AI 代码点评全局配置（默认关闭，开发/演示时手动开启） */

function isOnlinePracticeAiReviewEnabled() {
  const v = String(process.env.ONLINE_PRACTICE_AI_REVIEW_ENABLED ?? '0').trim();
  return v === '1' || v.toLowerCase() === 'true';
}

function getAiReviewTimeoutMs() {
  const n = Number(process.env.ONLINE_PRACTICE_AI_REVIEW_TIMEOUT_MS);
  if (Number.isFinite(n) && n >= 5000 && n <= 120000) return Math.floor(n);
  return 45000;
}

function getAiReviewCooldownSec() {
  const n = Number(process.env.ONLINE_PRACTICE_AI_REVIEW_COOLDOWN_SEC);
  if (Number.isFinite(n) && n >= 0 && n <= 600) return Math.floor(n);
  return 60;
}

module.exports = {
  isOnlinePracticeAiReviewEnabled,
  getAiReviewTimeoutMs,
  getAiReviewCooldownSec,
};
