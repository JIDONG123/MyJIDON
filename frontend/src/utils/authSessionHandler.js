import { ElMessage } from 'element-plus'
import { getActivePinia } from 'pinia'
import { clearAuthStorage } from './authStorage'
import { disconnectRealtime } from '../socket/realtimeClient'

const NOTICE_KEY = 'auth_logout_notice'

let handling = false

export function stashAuthLogoutNotice(code, message) {
  try {
    sessionStorage.setItem(NOTICE_KEY, JSON.stringify({ code, message }))
  } catch {
    /* ignore */
  }
}

export function consumeAuthLogoutNotice() {
  try {
    const raw = sessionStorage.getItem(NOTICE_KEY)
    if (!raw) return null
    sessionStorage.removeItem(NOTICE_KEY)
    return JSON.parse(raw)
  } catch {
    sessionStorage.removeItem(NOTICE_KEY)
    return null
  }
}

export function resolveAuthSessionMessage(error) {
  const data = error?.response?.data || {}
  const code = data.code
  const msg = String(data.message || '').trim()

  if (code === 'SESSION_KICKED' || /其他设备登录/.test(msg)) {
    return { code: 'SESSION_KICKED', message: '账号已在其他设备登录，当前会话已下线。' }
  }
  if (code === 'SESSION_EXPIRED' || (error?.response?.status === 401 && /过期/.test(msg))) {
    return { code: 'SESSION_EXPIRED', message: '登录状态已过期，请重新登录。' }
  }
  return null
}

/**
 * 强制结束当前会话并跳转登录页（仅触发一次提示）
 */
export function forceAuthSessionEnd({ code, message, redirect = '/login' } = {}) {
  if (handling) return
  handling = true

  const finalCode = code || 'SESSION_EXPIRED'
  const finalMessage =
    message ||
    (finalCode === 'SESSION_KICKED'
      ? '账号已在其他设备登录，当前会话已下线。'
      : '登录状态已过期，请重新登录。')

  stashAuthLogoutNotice(finalCode, finalMessage)
  clearAuthStorage()
  disconnectRealtime()

  try {
    const pinia = getActivePinia()
    pinia?._s?.get('pageCache')?.clear?.()
  } catch {
    /* ignore */
  }

  try {
    ElMessage.warning(finalMessage)
  } catch {
    /* ignore */
  }

  const target = redirect || '/login'
  window.setTimeout(() => {
    if (window.location.pathname !== target) {
      window.location.href = target
    } else {
      handling = false
    }
  }, 80)
}

export function resetAuthSessionHandler() {
  handling = false
}
