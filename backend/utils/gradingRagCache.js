/**
 * 标准路径 RAG 检索缓存（按 teacher + task + queryHash，不含学生全文）
 */
const crypto = require('crypto');
const { safeGet, safeSet, safeDelByPrefix } = require('./redisClient');
const { getRagCacheTtl } = require('./bullmqGradingConfig');
const { buildRagQueryText, retrieveTeacherKbHits } = require('./ragRetrieve');
const { getCachedTaskGradingContext } = require('./gradingTaskContextCache');

const PREFIX = 'grading:rag:';

function buildQueryHash(task, taskContext) {
  const parts = [
    task?.title || '',
    task?.requirements || '',
    task?.scoring_criteria || '',
    taskContext?.course_name || '',
    taskContext?.course_goal || '',
    taskContext?.template_project_name || '',
    taskContext?.template_description || '',
  ];
  return crypto.createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32);
}

function cacheKey(teacherId, taskId, queryHash) {
  return `${PREFIX}${teacherId}:${taskId}:${queryHash}`;
}

async function retrieveTeacherKbContextCached(teacherId, task, taskContext) {
  const ttl = getRagCacheTtl();
  const tid = Number(task?.id);
  const queryHash = buildQueryHash(task, taskContext);
  const key = cacheKey(teacherId, tid, queryHash);

  if (ttl > 0) {
    const hit = await safeGet(key);
    if (hit) {
      try {
        const parsed = JSON.parse(hit);
        return parsed.contextText || '';
      } catch {
        /* miss */
      }
    }
  }

  const queryText = buildRagQueryText(task, '');
  const { contextText, hits } = await retrieveTeacherKbHits(teacherId, queryText);

  if (ttl > 0 && contextText) {
    await safeSet(
      key,
      JSON.stringify({ contextText, hits: hits || [], queryHash }),
      'EX',
      ttl
    );
  }
  return contextText || '';
}

async function clearGradingRagCacheForTeacher(teacherId) {
  if (teacherId == null) return;
  await safeDelByPrefix(`${PREFIX}${teacherId}:`);
}

module.exports = {
  buildQueryHash,
  retrieveTeacherKbContextCached,
  clearGradingRagCacheForTeacher,
};
