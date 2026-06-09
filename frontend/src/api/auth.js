import request from './index'

export const getCaptcha = () => {
  return request.get('/auth/captcha')
}

export const forgotPassword = (username, email) => {
  return request.post('/auth/forgot-password', { username, email })
}

export const resetPassword = (token, newPassword, confirmPassword) => {
  return request.post('/auth/reset-password', { token, newPassword, confirmPassword })
}

export const changeInitialPassword = (oldPassword, newPassword, confirmPassword) => {
  return request.post('/auth/change-initial-password', { oldPassword, newPassword, confirmPassword })
}
