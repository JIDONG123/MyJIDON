import request from './index'

export const getVlRecognition = (submissionId) => {
  return request.get(`/submissions/${submissionId}/vl-recognition`)
}

export const postVlRecognize = (submissionId, config = {}) => {
  return request.post(`/submissions/${submissionId}/vl-recognize`, null, {
    timeout: 180000,
    ...config,
  })
}
