import request from './index'

export const listCourses = (params) => request.get('/courses', { params })
export const listMyCourses = (params) => request.get('/courses/mine', { params })
export const getCourse = (id) => request.get(`/courses/${id}`)
export const createCourse = (data) => request.post('/courses', data)
export const updateCourse = (id, data) => request.put(`/courses/${id}`, data)
export const deleteCourse = (id) => request.delete(`/courses/${id}`)
