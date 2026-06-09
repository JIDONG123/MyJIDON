import request from './index'

export const getDashboardStats = () => {
  return request.get('/dashboard/stats')
}

export const getClassStatistics = (classId) => {
  return request.get(`/dashboard/class/${classId}`)
}

/** scopeType: legacy_class | teaching_class | course */
export const getPracticeStatistics = (params) => {
  return request.get('/dashboard/practice-stats', { params })
}

export const exportClassScores = (classId) => {
  return request.get(`/dashboard/class/${classId}/export`, { responseType: 'blob' })
}

export const exportPracticeScores = (params) => {
  return request.get('/dashboard/practice-export', { params, responseType: 'blob' })
}

export const getAllClassStatistics = () => {
  return request.get('/dashboard/classes')
}

export const getBigScreenStats = (params = {}) => {
  return request.get('/dashboard/big-screen', { params })
}