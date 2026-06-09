/**
 * 任务级批改上下文 Redis 缓存（不含学生提交内容）
 */
const crypto = require('crypto');
const { safeGet, safeSet, safeDel } = require('./redisClient');
const { getTaskContextCacheTtl } = require('./bullmqGradingConfig');
const { loadTaskGradingContext, applyGradingContextToTask } = require('./taskGradingContext');

const PREFIX = 'grading:taskContext:';

function cacheKey(taskId) {
  return `${PREFIX}${taskId}`;
}

async function getCachedTaskGradingContext(taskId) {
  const ttl = getTaskContextCacheTtl();
  if (ttl <= 0) {
    const raw = await loadTaskGradingContext(taskId);
    return raw || null;
  }
  const key = cacheKey(taskId);
  const hit = await safeGet(key);
  if (hit) {
    try {
      return JSON.parse(hit);
    } catch {
      /* rebuild */
    }
  }
  const ctx = await loadTaskGradingContext(taskId);
  if (ctx && ttl > 0) {
    await safeSet(key, JSON.stringify(ctx), 'EX', ttl);
  }
  return ctx;
}

async function enrichTaskForGradingCached(task, taskId) {
  const tid = taskId || task?.id;
  if (!tid) return task;
  const ctx = await getCachedTaskGradingContext(tid);
  if (!ctx) return task;
  return applyGradingContextToTask({ ...task }, ctx);
}

async function clearTaskGradingContextCache(taskId) {
  if (taskId == null) return;
  await safeDel(cacheKey(taskId));
}

module.exports = {
  getCachedTaskGradingContext,
  enrichTaskForGradingCached,
  clearTaskGradingContextCache,
  cacheKey,
};
