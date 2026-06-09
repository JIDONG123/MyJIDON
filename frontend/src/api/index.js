import axios from 'axios'
import { getToken } from '../utils/authStorage'
import { forceAuthSessionEnd, resolveAuthSessionMessage } from '../utils/authSessionHandler'

const instance = axios.create({
  baseURL: '/api',
  timeout: 30000
})

instance.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

instance.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    const status = error.response?.status
    const reqUrl = String(error.config?.url || '')
    const isPublicAuth =
      reqUrl.includes('/users/login') ||
      reqUrl.includes('/users/register') ||
      reqUrl.includes('/auth/captcha')

    const sessionMsg = resolveAuthSessionMessage(error)
    if (sessionMsg && !isPublicAuth) {
      forceAuthSessionEnd(sessionMsg)
      return Promise.reject(error)
    }

    if (status === 401 && !isPublicAuth) {
      forceAuthSessionEnd({
        code: 'SESSION_EXPIRED',
        message: '登录状态已过期，请重新登录。',
      })
    }
    return Promise.reject(error)
  }
)

export default instance
