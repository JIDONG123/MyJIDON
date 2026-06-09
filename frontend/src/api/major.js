import request from './index'

export const listMajors = (params) => request.get('/majors', { params })
export const getMajor = (id) => request.get(`/majors/${id}`)
export const createMajor = (data) => request.post('/majors', data)
export const updateMajor = (id, data) => request.put(`/majors/${id}`, data)
export const deleteMajor = (id) => request.delete(`/majors/${id}`)
