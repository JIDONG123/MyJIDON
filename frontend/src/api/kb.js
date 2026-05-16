import request from './index'

export const listKbDocuments = () => {
  return request.get('/kb/documents')
}

export const deleteKbDocument = (id) => {
  return request.delete(`/kb/documents/${id}`)
}

export const uploadKbDocument = (file, { category, title } = {}) => {
  const fd = new FormData()
  fd.append('file', file)
  if (category) fd.append('category', category)
  if (title) fd.append('title', title)
  return request.post('/kb/documents', fd, {
    timeout: 120000,
  })
}
