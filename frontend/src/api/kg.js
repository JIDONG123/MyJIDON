import request from './index'

export const getKgSyncStatus = () => request.get('/kg/sync-status')

export const postKgBuild = (data) => request.post('/kg/build', data)

export const getKgBuildJob = (jobId) => request.get(`/kg/build/${jobId}`)

export const getKgCourseGraph = (params) => request.get('/kg/course', { params })

export const getKgClassGraph = (classId) => request.get(`/kg/class/${classId}`)

export const getKgTeacherScopes = () => request.get('/kg/teacher-scopes')

export const getKgTeacherGraph = (params) => request.get('/kg/teacher-graph', { params })

export const getKgStudentGraph = (studentId) => request.get(`/kg/student/${studentId}`)

export const getKgGradingContext = (submissionId) =>
  request.get(`/kg/grading-context/${submissionId}`)

export const postKgReconcile = () => request.post('/kg/reconcile')
