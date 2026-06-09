/**
 * 旧 AI 批改 HTTP 响应契约（供回归脚本与单元测试共用）
 */

const LEGACY_AI_REQUIRED = ['async', 'submissionId', 'status'];
const LEGACY_AI_OPTIONAL = ['jobId', 'deduped'];

const LEGACY_BATCH_REQUIRED = ['async', 'taskId', 'queued'];
const LEGACY_BATCH_OPTIONAL = ['batchId', 'jobId', 'deduped', 'batchMode', 'requestedCount', 'acceptedCount', 'skippedCount', 'skippedItems'];

const LEGACY_BATCH_PROGRESS_REQUIRED = ['taskId', 'batchId', 'total', 'grading', 'failed', 'done'];
const LEGACY_BATCH_PROGRESS_OPTIONAL = ['jobId', 'progress', 'status'];

function assertShape(data, required, optional, label) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return [`${label}: data 不是对象`];
  }
  for (const key of required) {
    if (!(key in data)) errors.push(`${label}: 缺少字段 ${key}`);
  }
  for (const key of Object.keys(data)) {
    if (!required.includes(key) && !optional.includes(key)) {
      errors.push(`${label}: 非预期字段 ${key}`);
    }
  }
  return errors;
}

function assertLegacyAiGradeData(data) {
  return assertShape(data, LEGACY_AI_REQUIRED, LEGACY_AI_OPTIONAL, 'aiGrade.data');
}

function assertLegacyBatchGradeData(data) {
  return assertShape(data, LEGACY_BATCH_REQUIRED, LEGACY_BATCH_OPTIONAL, 'batchGrade.data');
}

function assertLegacyBatchProgressData(data) {
  return assertShape(
    data,
    LEGACY_BATCH_PROGRESS_REQUIRED,
    LEGACY_BATCH_PROGRESS_OPTIONAL,
    'batchProgress.data'
  );
}

function buildLegacyAiResponse(result) {
  return {
    success: true,
    message: result.deduped ? 'AI 批改进行中或已在队列' : '已提交 AI 批改，后台处理中',
    data: {
      async: true,
      submissionId: result.submissionId,
      status: result.status,
      jobId: result.jobId ?? null,
      deduped: Boolean(result.deduped),
    },
  };
}

function buildLegacyBatchResponse(result, taskId) {
  if (!result.queued) {
    return {
      success: true,
      message: result.deduped ? result.message || '没有待批量批改的提交' : '没有待批量批改的提交',
      data: {
        async: true,
        taskId: Number(taskId),
        queued: 0,
        batchId: null,
        jobId: result.jobId ?? null,
        deduped: Boolean(result.deduped),
      },
    };
  }
  return {
    success: true,
    message: `已加入批量 AI 批改队列，共 ${result.queued} 份`,
    data: {
      async: true,
      taskId: result.taskId,
      queued: result.queued,
      batchId: result.batchId,
      jobId: result.jobId,
      deduped: Boolean(result.deduped),
    },
  };
}

module.exports = {
  LEGACY_AI_REQUIRED,
  LEGACY_BATCH_REQUIRED,
  LEGACY_BATCH_PROGRESS_REQUIRED,
  assertLegacyAiGradeData,
  assertLegacyBatchGradeData,
  assertLegacyBatchProgressData,
  buildLegacyAiResponse,
  buildLegacyBatchResponse,
};
