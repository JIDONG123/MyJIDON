import request from './index'

export const getAllTasks = (params = {}) => {
  return request.get('/tasks', { params })
}

export const getTaskById = (id) => {
  return request.get(`/tasks/${id}`)
}

export const createTask = (data) => {
  return request.post('/tasks', data)
}

export const updateTask = (id, data) => {
  return request.put(`/tasks/${id}`, data)
}

export const deleteTask = (id) => {
  return request.delete(`/tasks/${id}`)
}

export const getTasksByClass = (classId) => {
  return request.get(`/tasks/class/${classId}`)
}

export const getTaskSubmissionOverview = (taskId) => {
  return request.get(`/tasks/${taskId}/submission-overview`)
}