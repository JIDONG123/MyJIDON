import request from './index'

export function createCodeRunJob(body) {
  return request.post('/code-run/jobs', body)
}

export function getCodeRunJobResult(jobId) {
  return request.get(`/code-run/jobs/${jobId}/result`)
}

export function getCodeRunJob(jobId) {
  return request.get(`/code-run/jobs/${jobId}`)
}
