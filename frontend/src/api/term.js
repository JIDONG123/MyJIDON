import request from './index'

export const listTerms = () => request.get('/terms')
export const getTerm = (id) => request.get(`/terms/${id}`)
export const createTerm = (data) => request.post('/terms', data)
export const updateTerm = (id, data) => request.put(`/terms/${id}`, data)
export const deleteTerm = (id) => request.delete(`/terms/${id}`)
