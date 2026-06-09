import request from './index'

export function getFeedbackMeta() {
  return request.get('/submission-feedbacks/meta')
}

export function createSubmissionFeedback(data) {
  return request.post('/submission-feedbacks', data)
}

export function getMyFeedbacks(params = {}) {
  return request.get('/submission-feedbacks/my', { params })
}

export function getMyFeedbacksByTask(taskId) {
  return request.get(`/submission-feedbacks/my/task/${taskId}`)
}

export function listTeacherFeedbacks(params = {}) {
  return request.get('/teacher/submission-feedbacks', { params })
}

export function getTeacherFeedback(id) {
  return request.get(`/teacher/submission-feedbacks/${id}`)
}

export function replyTeacherFeedback(id, replyContent) {
  return request.post(`/teacher/submission-feedbacks/${id}/reply`, { replyContent })
}

export function returnTeacherFeedback(id, payload) {
  return request.post(`/teacher/submission-feedbacks/${id}/return`, payload)
}

export function rejectTeacherFeedback(id, rejectReason) {
  return request.post(`/teacher/submission-feedbacks/${id}/reject`, { rejectReason })
}

export function closeTeacherFeedback(id) {
  return request.post(`/teacher/submission-feedbacks/${id}/close`)
}

export const FEEDBACK_TYPE_LABELS = {
  score_question: '成绩疑问',
  request_resubmit: '申请重新提交',
  ai_grading_question: 'AI 批改疑问',
  teacher_comment: '教师评语疑问',
  file_error: '附件/代码提交错误',
  other: '其他问题',
}

export const FEEDBACK_STATUS_LABELS = {
  pending: '待处理',
  replied: '已回复',
  returned: '已退回',
  rejected: '已驳回',
  closed: '已关闭',
}

export const FEEDBACK_STATUS_TAG = {
  pending: 'warning',
  replied: 'success',
  returned: 'primary',
  rejected: 'danger',
  closed: 'info',
}
