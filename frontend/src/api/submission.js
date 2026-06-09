import request from './index'

export const submitAssignment = (data, axiosConfig = {}) => {
  // 使用 FormData 时不要手动设置 Content-Type，否则缺少 boundary，服务端无法解析字段导致 taskId 为空 → 500
  return request.post('/submissions', data, axiosConfig)
}

export const getSubmissionsByTask = (taskId) => {
  return request.get(`/submissions/task/${taskId}`)
}

export const getTeacherGradingWorkbench = (params) => {
  return request.get('/submissions/teacher/workbench', { params })
}

export const getSubmissionById = (id) => {
  return request.get(`/submissions/${id}`)
}

export const getSubmissionHistory = (submissionId) => {
  return request.get(`/submissions/${submissionId}/history`)
}

export const getSimilarityCompare = (id) => {
  return request.get(`/submissions/${id}/similarity-compare`)
}

export const getStudentSubmissions = () => {
  return request.get('/submissions/student/me')
}

export const getMySubmissionByTask = (taskId) => {
  return request.get(`/submissions/student/task/${taskId}`)
}

export const deleteSubmission = (id) => {
  return request.delete(`/submissions/${id}`)
}