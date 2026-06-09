import request from './index'

export const listTeachingClasses = (params) => request.get('/teaching-classes', { params })
export const listMyTeachingClasses = (params) => request.get('/teaching-classes/mine', { params })
export const getTeachingClass = (id) => request.get(`/teaching-classes/${id}`)
export const createTeachingClass = (data) => request.post('/teaching-classes', data)
export const updateTeachingClass = (id, data) => request.put(`/teaching-classes/${id}`, data)
export const deleteTeachingClass = (id) => request.delete(`/teaching-classes/${id}`)
export const setTeachingClassTeachers = (id, teachers) =>
  request.put(`/teaching-classes/${id}/teachers`, { teachers })
export const setTeachingClassStudents = (id, students) =>
  request.put(`/teaching-classes/${id}/students`, { students })
