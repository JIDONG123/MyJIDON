import request from './index'

export const getTeacherAdminSummary = () => request.get('/admin/teachers/summary')

export const downloadTeacherImportTemplate = () =>
  request.get('/admin/teachers/import-template', { responseType: 'blob' })

export const previewTeacherImport = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return request.post('/admin/teachers/import-preview', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const confirmTeacherImport = (batchId) =>
  request.post(`/admin/teachers/import-confirm/${batchId}`)

export const listTeacherImportBatches = (params) =>
  request.get('/admin/teachers/import-batches', { params })

export const getTeacherImportBatchDetail = (batchId) =>
  request.get(`/admin/teachers/import-batches/${batchId}`)

export const downloadTeacherImportResult = (batchId) =>
  request.get(`/admin/teachers/import-batches/${batchId}/result`, { responseType: 'blob' })
