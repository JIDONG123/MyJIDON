import request from './index'

export const getSettings = () => request.get('/settings')

export const updateSettings = (data) => request.put('/settings', data)

export const testLlmConnection = () =>
  request.post('/settings/test-llm', {}, { timeout: 120000 })

export const testEmbeddingConnection = () =>
  request.post('/settings/test-embedding', {}, { timeout: 60000 })
