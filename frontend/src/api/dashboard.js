import request from './index'

export const getDashboardStats = () => {
  return request.get('/dashboard/stats')
}

export const getClassStatistics = (classId) => {
  return request.get(`/dashboard/class/${classId}`)
}

export const exportClassScores = (classId) => {
  return request.get(`/dashboard/class/${classId}/export`, { responseType: 'blob' })
}

export const getAllClassStatistics = () => {
  return request.get('/dashboard/classes')
}

export const getBigScreenStats = (params = {}) => {
  return request.get('/dashboard/big-screen', { params })
}