import request from './index'

export const login = (username, password) => {
  return request.post('/users/login', { username, password })
}

export const register = (username, password, realName, email, classId) => {
  return request.post('/users/register', { username, password, realName, email, classId })
}

export const getUserInfo = () => {
  return request.get('/users/me')
}

export const updateMyProfile = (data) => {
  return request.patch('/users/me/profile', data)
}

export const getMyArchive = (params) => {
  return request.get('/users/me/archive', { params })
}

export const uploadMyAvatar = (file) => {
  const fd = new FormData()
  fd.append('avatar', file)
  return request.post('/users/me/avatar', fd)
}

export const pickStudents = (params) => {
  if (typeof params === 'string') {
    return request.get('/users/pick-students', { params: { q: params } })
  }
  return request.get('/users/pick-students', { params })
}

export const getStudentUsers = (params) => {
  return request.get('/users/students', { params })
}

export const getTeacherUsers = (params) => {
  return request.get('/users/teachers', { params })
}

export const createStudent = (data) => {
  return request.post('/users/student', data)
}

export const getAllUsers = () => {
  return request.get('/users')
}

export const getUserById = (id) => {
  return request.get(`/users/${id}`)
}

export const updateUser = (id, data) => {
  return request.put(`/users/${id}`, data)
}

export const deleteUser = (id) => {
  return request.delete(`/users/${id}`)
}

export const createTeacher = (data) => {
  return request.post('/users/teacher', data)
}

export const createEnterpriseUser = (data) => {
  return request.post('/users/enterprise-accounts', data)
}

export const listEnterpriseUsers = () => {
  return request.get('/users/enterprise-accounts')
}

export const getEnterpriseUserClasses = (id) => {
  return request.get(`/users/enterprise-accounts/${id}/classes`)
}

export const setEnterpriseUserClasses = (id, classIds) => {
  return request.put(`/users/enterprise-accounts/${id}/classes`, { classIds })
}