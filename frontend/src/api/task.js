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

/**
 * Legacy API：按行政班 ID 拉取任务（仅 class_id 且 teaching_class_id IS NULL）。
 * 学生端实训中心请使用 getAllTasks()；本接口仍用于 StudentArchive、TeacherExport、TeacherKnowledgeGraph。
 */
export const getTasksByClass = (classId) => {
  return request.get(`/tasks/class/${classId}`)
}

export const getTasksByTeachingClass = (teachingClassId) => {
  return request.get(`/tasks/teaching-class/${teachingClassId}`)
}

export const getTaskSubmissionOverview = (taskId) => {
  return request.get(`/tasks/${taskId}/submission-overview`)
}