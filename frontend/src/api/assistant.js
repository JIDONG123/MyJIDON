import request from './index'

export const listAssistantSessions = () => {
  return request.get('/assistant/sessions')
}

export const createAssistantSession = (data) => {
  return request.post('/assistant/sessions', data || {})
}

export const listAssistantMessages = (sessionId) => {
  return request.get(`/assistant/sessions/${sessionId}/messages`)
}

export const sendAssistantMessage = (sessionId, content) => {
  return request.post(`/assistant/sessions/${sessionId}/messages`, { content })
}
