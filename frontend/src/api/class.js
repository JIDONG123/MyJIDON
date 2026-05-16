import request from './index'

export const getPublicClassNames = () => {
  return request.get('/classes/public/names')
}

export const getMyTeachingOverview = () => {
  return request.get('/classes/my/overview')
}

export const getAllClasses = () => {
  return request.get('/classes')
}

export const addStudentToClass = (classId, studentId) => {
  return request.post(`/classes/${classId}/students`, { studentId })
}

export const addStudentsToClassBatch = (classId, studentIds) => {
  return request.post(`/classes/${classId}/students/batch`, { studentIds })
}

export const getClassById = (id) => {
  return request.get(`/classes/${id}`)
}

export const createClass = (data) => {
  return request.post('/classes', data)
}

export const updateClass = (id, data) => {
  return request.put(`/classes/${id}`, data)
}

export const deleteClass = (id) => {
  return request.delete(`/classes/${id}`)
}

export const getClassStudents = (id) => {
  return request.get(`/classes/${id}/students`)
}

export const getLatestAnnouncementForStudent = () => {
  return request.get('/classes/my/latest-announcement')
}

export const listClassAnnouncements = (classId) => {
  return request.get(`/classes/${classId}/announcements`)
}

export const createClassAnnouncement = (classId, data) => {
  return request.post(`/classes/${classId}/announcements`, data)
}

export const updateClassAnnouncement = (classId, announcementId, data) => {
  return request.put(`/classes/${classId}/announcements/${announcementId}`, data)
}

export const deleteClassAnnouncement = (classId, announcementId) => {
  return request.delete(`/classes/${classId}/announcements/${announcementId}`)
}