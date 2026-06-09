import { ElMessage } from 'element-plus'

import { upsertGradingJobFromRt } from '../stores/gradingJobProgress'



export const GRADING_QUEUED_MSG = '批改任务已进入后台执行，可以继续使用系统'



const TERMINAL = new Set(['completed', 'partial_failed', 'failed', 'cancelled'])



function seedJobCardFromApi(data, { taskId, submissionId } = {}) {

  if (!data?.jobId) return

  const isBatch = data.scopeType === 'batch_task' || (data.queued ?? 0) > 0 || data.batchId != null

  const status = data.jobStatus || (TERMINAL.has(data.status) ? data.status : 'pending')

  upsertGradingJobFromRt({

    jobId: data.jobId,

    status,

    scopeType: data.scopeType || (isBatch ? 'batch_task' : 'single'),

    taskId: data.taskId ?? taskId ?? null,

    taskTitle: data.taskTitle || '',

    submissionId: data.submissionId ?? submissionId ?? null,

    totalCount: isBatch ? Number(data.totalCount ?? data.queued) || 0 : Number(data.totalCount) || 1,

    finishedCount: Number(data.finishedCount) || 0,

    progress: Number(data.progress) || 0,

    message: data.message,

    legacyBatchId: data.batchId != null ? String(data.batchId) : null,
    createdAt: data.createdAt || new Date().toISOString(),
    action: data.deduped ? 'job_deduped' : 'job_queued',

  })

}



/**

 * 处理 AI 批改入队响应：更新进度卡片 + 轻提示（无全屏遮罩）

 */

export function applyGradingJobResponse(response, { taskId, submissionId } = {}) {

  if (!response?.success) return false



  const data = response.data || {}

  const jobId = data.jobId

  const deduped =

    Boolean(data.deduped) ||

    /进行中|已在队列|已在批改/.test(String(response.message || ''))



  if (data.queued === 0 && !jobId) {

    ElMessage.info(response.message || '没有待批量批改的提交')

    return true

  }



  if (jobId) {

    seedJobCardFromApi(data, { taskId, submissionId })

  }



  ElMessage.success({

    message: deduped

      ? '该提交已在批改队列中，可在右下角或「批改任务」查看进度'

      : GRADING_QUEUED_MSG,

    duration: 5000,

    showClose: true,

  })

  return true

}



export function gradingJobErrorMessage(error) {

  return (

    error?.response?.data?.message ||

    error?.response?.data?.error ||

    error?.message ||

    '操作失败'

  )

}



export function upsertJobFromDetail(job) {

  if (!job?.id) return

  upsertGradingJobFromRt({

    jobId: job.id,

    status: job.status,

    scopeType: job.scope_type,

    taskId: job.task_id,

    taskTitle: job.task_title,

    totalCount: job.total_count,

    finishedCount: job.finished_count,

    successCount: job.success_count,

    failedCount: job.failed_count,

    progress: job.progress,

    message: job.message,

    action: 'poll',

  })

}


