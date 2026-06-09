import request from './index'

export const getSettings = () => request.get('/settings')

export const getAiSettings = () => request.get('/settings/ai')

export const updateSettings = (data) => request.put('/settings', data)

export const saveQwenVlSettings = (data) => request.post('/settings/qwen-vl', data)

export const testLlmConnection = () =>
  request.post('/settings/test-llm', {}, { timeout: 120000 })

export const testEmbeddingConnection = () =>
  request.post('/settings/test-embedding', {}, { timeout: 60000 })

export const testQwenVlConnection = (formData) =>
  request.post('/settings/qwen-vl/test', formData, { timeout: 120000 })

export const saveKgNeo4jSettings = (data) => request.post('/settings/kg-neo4j', data)

export const testKgNeo4jConnection = () =>
  request.post('/settings/kg-neo4j/test', {}, { timeout: 60000 })

export const getKgNeo4jStats = () =>
  request.post('/settings/kg-neo4j/stats', {}, { timeout: 60000 })

export const reconcileKgOnce = () =>
  request.post('/settings/kg-neo4j/reconcile-once', {}, { timeout: 120000 })
