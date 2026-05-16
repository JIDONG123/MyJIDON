import request from './index'

/** 提交批改请求：接口应快速返回，由后台队列执行 */
const gradePost = { timeout: 120000 }

export const aiGradeSubmission = (submissionId) => {
  return request.post(`/grading/ai/${submissionId}`, {}, gradePost)
}

export const batchAiGrade = (taskId) => {
  return request.post(`/grading/batch/${taskId}`, {}, gradePost)
}

export const getBatchGradingProgress = (batchId) => {
  return request.get(`/grading/batch-progress/${batchId}`)
}

/**
 * 获取单条批改结果。兼容旧后端：尚无 grading_results 时曾返回 HTTP 404，此处转为 success + data:null，避免控制台红错。
 * 若 404 为「提交不存在」，仍抛出由调用方处理。
 */
export async function getGradingResult(submissionId) {
  try {
    return await request.get(`/grading/${submissionId}`)
  } catch (e) {
    const st = e?.response?.status
    const msg = String(e?.response?.data?.message || '')
    if (st === 404) {
      if (msg.includes('提交不存在')) throw e
      return { success: true, data: null, message: msg || '暂无批改结果' }
    }
    throw e
  }
}

/**
 * 轮询直到 AI 队列完成或失败（不修改页面结构，仅配合异步批改）
 */
export async function waitForAiGradingComplete(submissionId, options = {}) {
  const intervalMs = options.intervalMs ?? 2500
  const maxWaitMs = options.maxWaitMs ?? 600000
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    try {
      const r = await getGradingResult(submissionId)
      if (!r.success) {
        return { ok: false, response: r }
      }
      const st = r.data?.status
      if (st === 'ai_graded' || st === 'human_graded') {
        return { ok: true, failed: false, data: r.data }
      }
      if (st === 'ai_failed') {
        return { ok: true, failed: true, data: r.data }
      }
    } catch (e) {
      return { ok: false, error: e }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return { ok: false, timeout: true }
}

export const humanReview = (submissionId, data) => {
  return request.put(`/grading/human/${submissionId}`, data)
}

export const enterpriseReview = (submissionId, data) => {
  return request.put(`/grading/enterprise/${submissionId}`, data)
}

export const patchGradingVerification = (submissionId, verificationTeacherOverride) => {
  return request.patch(`/grading/verification/${submissionId}`, {
    verification_teacher_override: verificationTeacherOverride,
  })
}

export const getStudentGradingResults = () => {
  return request.get('/grading/student/me')
}
