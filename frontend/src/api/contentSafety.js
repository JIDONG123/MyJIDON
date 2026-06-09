import request from './index'

export const listContentSafetyReviews = (params) =>
  request.get('/content-safety/reviews', { params })

export const getContentSafetyReview = (id) =>
  request.get(`/content-safety/reviews/${id}`)

export const approveContentSafetyReview = (id, reviewNote) =>
  request.post(`/content-safety/reviews/${id}/approve`, { reviewNote })

export const rejectContentSafetyReview = (id, reviewNote) =>
  request.post(`/content-safety/reviews/${id}/reject`, { reviewNote })
