/**
 * BullMQ AI 批改队列配置（环境变量集中读取）
 */

function envFlag(name, defaultOn = false) {
  const v = process.env[name];
  if (v === undefined || v === '') return defaultOn;
  return v === '1' || v === 'true' || v === 'yes';
}

function envInt(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function isBullmqEnabled() {
  return envFlag('BULLMQ_ENABLED', false);
}

function getBullmqPrefix() {
  return (process.env.BULLMQ_PREFIX || 'smart-grading').trim();
}

function getQueueName() {
  return (process.env.AI_GRADING_QUEUE_NAME || 'ai-grading').trim();
}

function getItemConcurrency() {
  const item = envInt('AI_GRADING_ITEM_CONCURRENCY', 0);
  if (item > 0) return item;
  return Math.max(1, envInt('AI_GRADING_JOB_CONCURRENCY', 2));
}

function getGradingTimeoutMs() {
  return envInt('AI_GRADING_TIMEOUT_MS', 90000);
}

function getGradingRetry() {
  return envInt('AI_GRADING_RETRY', 1);
}

function getGradingBackoffMs() {
  return envInt('AI_GRADING_BACKOFF_MS', 2000);
}

function getRagCacheTtl() {
  return envInt('AI_GRADING_RAG_CACHE_TTL', 1800);
}

function getTaskContextCacheTtl() {
  return envInt('AI_GRADING_TASK_CONTEXT_CACHE_TTL', 1800);
}

function getBullmqAttempts() {
  return getGradingRetry() + 1;
}

function bullmqJobIdForItem(gradingJobItemId, retryCount = 0) {
  const id = Number(gradingJobItemId);
  const rc = Number(retryCount) || 0;
  if (rc <= 0) return `gji-${id}`;
  return `gji-${id}-r${rc}`;
}

/** 某 item 可能存在的全部 BullMQ jobId（含历史重试） */
function bullmqJobIdsForItem(gradingJobItemId, retryCount = 0) {
  const rc = Math.max(0, Number(retryCount) || 0);
  const ids = [];
  for (let r = 0; r <= rc; r += 1) {
    ids.push(bullmqJobIdForItem(gradingJobItemId, r));
  }
  return ids;
}

function getBullmqConnectionOptions(forWorker = false) {
  const url = process.env.REDIS_URL;
  if (url) {
    return {
      url,
      maxRetriesPerRequest: forWorker ? null : 2,
      enableReadyCheck: !forWorker,
    };
  }
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    maxRetriesPerRequest: forWorker ? null : 2,
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000', 10),
    enableReadyCheck: !forWorker,
  };
}

module.exports = {
  isBullmqEnabled,
  getBullmqPrefix,
  getQueueName,
  getItemConcurrency,
  getGradingTimeoutMs,
  getGradingRetry,
  getGradingBackoffMs,
  getRagCacheTtl,
  getTaskContextCacheTtl,
  getBullmqAttempts,
  bullmqJobIdForItem,
  bullmqJobIdsForItem,
  getBullmqConnectionOptions,
};
