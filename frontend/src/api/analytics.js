import request from './index'

export const getClassWeak = (classId) => {
  return request.get(`/analytics/class/${classId}/weak`)
}

export const getMyClassWeak = () => {
  return request.get('/analytics/student/me/class-weak')
}

export const getMyLearningProfile = () => {
  return request.get('/analytics/student/me/profile')
}

export const getMyRecommendations = () => {
  return request.get('/analytics/student/me/recommendations')
}

export const getAssistantTeacherStats = () => {
  return request.get('/analytics/teacher/assistant-stats')
}

/** 教师：查看 / 保存某班「分层推荐」分数线（走 /api/classes，与班级资源一致） */
export const getClassRecommendationRules = (classId) => {
  return request.get(`/classes/${classId}/recommendation-rules`)
}

export const putClassRecommendationRules = (classId, body) => {
  return request.put(`/classes/${classId}/recommendation-rules`, body)
}
