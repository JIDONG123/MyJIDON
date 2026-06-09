import request from './index'

export const getStudentAdminSummary = () => request.get('/admin/students/summary')

export const downloadStudentImportTemplate = () =>
  request.get('/admin/students/import-template', { responseType: 'blob' })

export const previewStudentImport = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return request.post('/admin/students/import-preview', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const confirmStudentImport = (batchId) =>
  request.post(`/admin/students/import-confirm/${batchId}`)

export const listStudentImportBatches = (params) =>
  request.get('/admin/students/import-batches', { params })

export const getStudentImportBatchDetail = (batchId) =>
  request.get(`/admin/students/import-batches/${batchId}`)

export const downloadStudentImportResult = (batchId) =>
  request.get(`/admin/students/import-batches/${batchId}/result`, { responseType: 'blob' })
