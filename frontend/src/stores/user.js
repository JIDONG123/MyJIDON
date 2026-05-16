import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as apiLogin, register as apiRegister, getUserInfo } from '../api/user'
import { disconnectRealtime } from '../socket/realtimeClient'

function readUserFromStorage() {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '')
  // 与 token 一致：首屏同步从 localStorage 恢复，避免布局渲染时 user 仍为 null 报错
  const user = ref(readUserFromStorage())
  const isLoggedIn = computed(() => !!token.value && !!user.value)

  const login = async (username, password) => {
    try {
      const response = await apiLogin(username, password)
      if (response.success) {
        token.value = response.token
        user.value = response.user
        localStorage.setItem('token', response.token)
        localStorage.setItem('user', JSON.stringify(response.user))
        return true
      }
      return false
    } catch (error) {
      console.error('Login error:', error)
      return false
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

  const logout = () => {
    disconnectRealtime()
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  const loadUserFromStorage = () => {
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      user.value = JSON.parse(storedUser)
    }
  }

  const fetchUserInfo = async () => {
    try {
      const response = await getUserInfo()
      if (response.success) {
        user.value = response.user
        localStorage.setItem('user', JSON.stringify(response.user))
      }
    } catch (error) {
      console.error('Fetch user info error:', error)
    }
  }

  return {
    token,
    user,
    isLoggedIn,
    login,
    register,
    logout,
    loadUserFromStorage,
    fetchUserInfo
  }
})