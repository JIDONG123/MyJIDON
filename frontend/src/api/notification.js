import request from './index'

export const listNotifications = (params) => {
  return request.get('/notifications', { params })
}

export const getUnreadNotificationCount = () => {
  return request.get('/notifications/unread-count')
}

export const markNotificationRead = (id) => {
  return request.patch(`/notifications/${id}/read`)
}

export const markAllNotificationsRead = () => {
  return request.patch('/notifications/read-all')
}
