import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as apiLogin, logout as apiLogout, register as apiRegister, getUserInfo } from '../api/user'
import { resetAuthSessionHandler } from '../utils/authSessionHandler'
import { disconnectRealtime } from '../socket/realtimeClient'
import { resetCodeRunnerProbe } from '../composables/useCodeRunnerFeature'
import {
  clearAuthStorage,
  clearLegacyAuthStorage,
  getToken,
  getUserRaw,
  setToken,
  setUserRaw,
} from '../utils/authStorage'

function readUserFromStorage() {
  try {
    const raw = getUserRaw()
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// 清理旧版 localStorage 登录态（不影响当前 sessionStorage）
clearLegacyAuthStorage()

export const useUserStore = defineStore('user', () => {
  const token = ref(getToken())
  const user = ref(readUserFromStorage())
  const isLoggedIn = computed(() => !!token.value && !!user.value)

  const login = async (username, password, captchaId, captchaCode) => {
    try {
      const response = await apiLogin(username, password, captchaId, captchaCode)
      if (response.success) {
        token.value = response.token
        user.value = response.user
        setToken(response.token)
        setUserRaw(JSON.stringify(response.user))
        return true
      }
      return false
    } catch (error) {
      console.error('Login error:', error)
      throw error
    }
  }

  /** @returns {Promise<{ success: boolean, message?: string }>} */
  const register = async (username, password, realName, email, classId) => {
    try {
      const response = await apiRegister(username, password, realName, email, classId)
      if (response?.success) {
        return { success: true }
      }
      return {
        success: false,
        message: response?.message || '注册失败',
      }
    } catch (error) {
      console.error('Register error:', error)
      const msg = error?.response?.data?.message
      return { success: false, message: msg || '注册失败，请稍后重试' }
    }
  }

  const logout = async (options = {}) => {
    const { callApi = true } = options
    const previousToken = token.value || getToken()
    disconnectRealtime()
    token.value = ''
    user.value = null
    clearAuthStorage()
    resetCodeRunnerProbe()
    resetAuthSessionHandler()
    if (callApi && previousToken) {
      apiLogout(previousToken).catch(() => {
        /* 已被踢下线或网络异常时忽略 */
      })
    }
  }

  const loadUserFromStorage = () => {
    const storedUser = getUserRaw()
    if (storedUser) {
      user.value = JSON.parse(storedUser)
    }
  }

  const fetchUserInfo = async () => {
    try {
      const response = await getUserInfo()
      if (response.success) {
        user.value = response.user
        setUserRaw(JSON.stringify(response.user))
      }
    } catch (error) {
      console.error('Fetch user info error:', error)
    }
  }

  const clearMustChangePassword = () => {
    if (!user.value) return
    user.value = { ...user.value, mustChangePassword: false }
    setUserRaw(JSON.stringify(user.value))
  }

  return {
    token,
    user,
    isLoggedIn,
    login,
    register,
    logout,
    loadUserFromStorage,
    fetchUserInfo,
    clearMustChangePassword,
  }
})