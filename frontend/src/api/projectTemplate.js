import request from './index'

export const listProjectTemplates = (params) => request.get('/project-templates', { params })
export const getProjectTemplate = (id) => request.get(`/project-templates/${id}`)
export const createProjectTemplate = (data) => request.post('/project-templates', data)
export const updateProjectTemplate = (id, data) => request.put(`/project-templates/${id}`, data)
export const deleteProjectTemplate = (id) => request.delete(`/project-templates/${id}`)
export const spawnTaskFromTemplate = (id, data) => request.post(`/project-templates/${id}/spawn-task`, data)
