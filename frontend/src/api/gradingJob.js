import request from './index'

export function listGradingJobs(params = {}) {
  return request.get('/grading/jobs', { params })
}

export function getGradingJob(jobId, params = {}) {
  return request.get(`/grading/jobs/${jobId}`, { params })
}

export function cancelGradingJob(jobId) {
  return request.post(`/grading/jobs/${jobId}/cancel`)
}

export function retryGradingJob(jobId) {
  return request.post(`/grading/jobs/${jobId}/retry`)
}

export function createGradingJob(body) {
  return request.post('/grading/jobs', body)
}

export function getGradingWorkerHealth() {
  return request.get('/grading/worker-health')
}
