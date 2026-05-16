const crypto = require('crypto');
const { safeGet, safeSet, safeDel, safeDelByPrefix } = require('./redisClient');

const PREFIX = process.env.CACHE_KEY_PREFIX || 'sg:';

const TTL = {
  userMe: parseInt(process.env.CACHE_TTL_USER_ME || '120', 10),
  classesList: parseInt(process.env.CACHE_TTL_CLASSES || '180', 10),
  teachingOverview: parseInt(process.env.CACHE_TTL_TEACHING_OVERVIEW || '120', 10),
  taskDetail: parseInt(process.env.CACHE_TTL_TASK || '120', 10),
  dashboard: parseInt(process.env.CACHE_TTL_DASHBOARD || '60', 10),
  settings: parseInt(process.env.CACHE_TTL_SETTINGS || '300', 10),
  qbExam: parseInt(process.env.CACHE_TTL_QB_EXAM || '90', 10),
};

function kUserMe(uid) {
  return `${PREFIX}user:me:${uid}`;
}
function kClasses(role, uid) {
  return `${PREFIX}classes:list:${role}:${uid}`;
}
function kTeachingOverview(tid) {
  return `${PREFIX}classes:overview:teacher:${tid}`;
}
function kTaskDetail(taskId, role, uid) {
  return `${PREFIX}task:detail:${taskId}:${role}:${uid}`;
}
function kDashboard(role, uid) {
  return `${PREFIX}dashboard:stats:${role}:${uid}`;
}
function kSettings() {
  return `${PREFIX}settings:admin`;
}

function kQbExamDetail(examId) {
  return `${PREFIX}qb:exam:detail:${examId}`;
}

async function getJson(cacheKey) {
  const raw = await safeGet(cacheKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setJson(cacheKey, obj, ttlSeconds) {
  try {
    const payload = JSON.stringify(obj);
    if (ttlSeconds > 0) {
      await safeSet(cacheKey, payload, 'EX', ttlSeconds);
    } else {
      await safeSet(cacheKey, payload);
    }
  } catch {
    /* Redis 故障时忽略 */
  }
}

async function invalidateUserMe(uid) {
  await safeDel(kUserMe(uid));
}

async function invalidateClassesFor(role, uid) {
  await safeDel(kClasses(role, uid));
  if (role === 'teacher') {
    await safeDel(kTeachingOverview(uid));
  }
}

async function invalidateTeachingOverview(teacherId) {
  await safeDel(kTeachingOverview(teacherId));
}

async function invalidateTaskDetail(taskId) {
  await safeDelByPrefix(`${PREFIX}task:detail:${taskId}:`);
}

async function invalidateDashboard(role, uid) {
  await safeDel(kDashboard(role, uid));
}

async function invalidateDashboardAllCommon() {
  await safeDelByPrefix(`${PREFIX}dashboard:stats:`);
}

async function invalidateSettings() {
  await safeDel(kSettings());
}

async function invalidateAllClassCaches() {
  await safeDelByPrefix(`${PREFIX}classes:list:`);
  await safeDelByPrefix(`${PREFIX}classes:overview:`);
}

/**
 * 批改、提交等后刷新统计与任务缓存
 */
async function invalidateAfterGrading(taskId, taskCreatedBy) {
  await invalidateTaskDetail(taskId);
  await invalidateDashboard('admin', 0);
  if (taskCreatedBy != null) {
    await invalidateDashboard('teacher', taskCreatedBy);
  }
}

async function invalidateAfterSubmission(taskId, classId, teacherId) {
  await invalidateTaskDetail(taskId);
  await invalidateDashboard('admin', 0);
  if (teacherId != null) {
    await invalidateDashboard('teacher', teacherId);
  }
  if (classId != null && teacherId != null) {
    await invalidateTeachingOverview(teacherId);
  }
}

async function invalidateQbExam(examId) {
  if (examId == null) return;
  await safeDel(kQbExamDetail(examId));
}

function stableHash(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32);
}

module.exports = {
  PREFIX,
  TTL,
  kUserMe,
  kClasses,
  kTeachingOverview,
  kTaskDetail,
  kDashboard,
  kSettings,
  kQbExamDetail,
  getJson,
  setJson,
  invalidateUserMe,
  invalidateClassesFor,
  invalidateTeachingOverview,
  invalidateTaskDetail,
  invalidateDashboard,
  invalidateDashboardAllCommon,
  invalidateSettings,
  invalidateAllClassCaches,
  invalidateAfterGrading,
  invalidateAfterSubmission,
  invalidateQbExam,
  stableHash,
};
