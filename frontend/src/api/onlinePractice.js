import request from './index'

export function listOnlinePracticeTemplates(params = {}) {
  return request.get('/online-practice/templates', { params })
}

export function getOnlinePracticeTemplate(id) {
  return request.get(`/online-practice/templates/${id}`)
}

export function createOnlinePracticeTemplate(data) {
  return request.post('/online-practice/templates', data)
}

export function updateOnlinePracticeTemplate(id, data) {
  return request.put(`/online-practice/templates/${id}`, data)
}

export function publishOnlinePracticeTemplate(id) {
  return request.post(`/online-practice/templates/${id}/publish`)
}

export function closeOnlinePracticeTemplate(id) {
  return request.post(`/online-practice/templates/${id}/close`)
}

export function openOnlinePracticeTemplate(id) {
  return request.post(`/online-practice/templates/${id}/open`)
}

export function listMyOnlinePracticeAttempts() {
  return request.get('/online-practice/attempts/mine')
}

export function getOnlinePracticeAttempt(id) {
  return request.get(`/online-practice/attempts/${id}`)
}

export function saveOnlinePracticeSource(attemptId, sourceCode) {
  return request.put(`/online-practice/attempts/${attemptId}/source`, { sourceCode })
}

export function runOnlinePracticeAttempt(attemptId, payload = {}) {
  return request.post(`/online-practice/attempts/${attemptId}/run`, payload)
}

export function getOnlinePracticeAiReviewStatus() {
  return request.get('/online-practice/ai-review/status')
}

export function getLatestOnlinePracticeAiReview(attemptId) {
  return request.get(`/online-practice/attempts/${attemptId}/ai-review/latest`)
}

export function createOnlinePracticeAiReview(attemptId, payload = {}) {
  return request.post(`/online-practice/attempts/${attemptId}/ai-review`, payload, {
    timeout: 50000,
  })
}
