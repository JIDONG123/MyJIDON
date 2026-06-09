import { reactive, computed } from 'vue'

const TERMINAL = new Set(['completed', 'partial_failed', 'failed', 'cancelled'])
const ACTIVE = new Set(['pending', 'running'])

export const gradingJobProgressState = reactive({
  jobs: {},
})

function normalizePayload(payload) {
  const jobId = payload?.jobId
  if (!jobId) return null
  return {
    jobId: Number(jobId),
    status: payload.status || 'pending',
    scopeType: payload.scopeType || null,
    taskId: payload.taskId ?? null,
    taskTitle: payload.taskTitle || '',
    totalCount: Number(payload.totalCount) || 0,
    finishedCount: Number(payload.finishedCount) || 0,
    successCount: Number(payload.successCount) || 0,
    failedCount: Number(payload.failedCount) || 0,
    progress: Number(payload.progress) || 0,
    message: payload.message || '',
    submissionId: payload.submissionId ?? null,
    legacyBatchId: payload.legacyBatchId ?? null,
    action: payload.action || 'progress',
    createdAt: payload.createdAt ?? null,
    runningCount: Number(payload.runningCount) || 0,
    updatedAt: Date.now(),
  }
}

export function upsertGradingJobFromRt(payload) {
  const next = normalizePayload(payload)
  if (!next) return
  const prev = gradingJobProgressState.jobs[next.jobId] || {}
  gradingJobProgressState.jobs[next.jobId] = { ...prev, ...next }

  if (TERMINAL.has(next.status)) {
    window.setTimeout(() => {
      delete gradingJobProgressState.jobs[next.jobId]
    }, 12000)
  }
}

export function seedGradingJobsFromList(rows = []) {
  for (const row of rows) {
    if (!row?.id || !ACTIVE.has(row.status)) continue
    upsertGradingJobFromRt({
      jobId: row.id,
      status: row.status,
      scopeType: row.scope_type,
      taskId: row.task_id,
      taskTitle: row.task_title,
      totalCount: row.total_count,
      finishedCount: row.finished_count,
      successCount: row.success_count,
      failedCount: row.failed_count,
      progress: row.progress,
      message: row.message,
      createdAt: row.created_at,
      runningCount: row.running_count,
      action: 'seed',
    })
  }
}

export const activeGradingJobs = computed(() =>
  Object.values(gradingJobProgressState.jobs)
    .filter((j) => ACTIVE.has(j.status))
    .sort((a, b) => b.updatedAt - a.updatedAt)
)

export function jobStatusLabel(status) {
  const map = {
    pending: '等待执行',
    running: '执行中',
    completed: '已完成',
    partial_failed: '部分完成',
    failed: '执行失败',
    cancelled: '已取消',
  }
  return map[status] || status
}

export function jobStatusTagType(status) {
  const map = {
    pending: 'info',
    running: 'primary',
    completed: 'success',
    partial_failed: 'warning',
    failed: 'danger',
    cancelled: 'info',
  }
  return map[status] || 'info'
}

export function jobScopeLabel(scopeType) {
  return scopeType === 'batch_task' ? '批量批改' : '单份批改'
}
