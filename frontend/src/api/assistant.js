import request from './index'
import { getToken } from '../utils/authStorage'
import { consumeAssistantSse } from '../utils/assistantSse'

export const listAssistantSessions = () => {
  return request.get('/assistant/sessions')
}

export const createAssistantSession = (data) => {
  return request.post('/assistant/sessions', data || {})
}

export const listAssistantMessages = (sessionId) => {
  return request.get(`/assistant/sessions/${sessionId}/messages`)
}

/** 非流式问答（fallback） */
export const sendAssistantMessage = (sessionId, content) => {
  return request.post(`/assistant/sessions/${sessionId}/messages`, { content }, { timeout: 120000 })
}

export function isAssistantStreamEnabled() {
  return import.meta.env.VITE_AI_STREAM_ENABLED !== 'false'
}

/**
 * 流式问答（fetch + SSE）
 */
export async function streamAssistantMessage(sessionId, content, handlers = {}) {
  const token = getToken()
  const response = await fetch(`/api/assistant/sessions/${sessionId}/messages/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ content }),
    signal: handlers.signal,
  })

  if (!response.ok) {
    let message = 'AI 服务暂时不可用，请稍后重试'
    try {
      const data = await response.json()
      if (data?.message) message = data.message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/event-stream')) {
    throw new Error('流式接口不可用')
  }

  await consumeAssistantSse(response, handlers)
}
