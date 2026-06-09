const TOKEN_KEY = 'token'
const USER_KEY = 'user'

/** 登录态仅存 sessionStorage：关闭浏览器后需重新登录 */
export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function getUserRaw() {
  return sessionStorage.getItem(USER_KEY)
}

export function setUserRaw(json) {
  sessionStorage.setItem(USER_KEY, json)
}

export function clearAuthStorage() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
  clearLegacyAuthStorage()
}

/** 仅清理旧版 localStorage 持久登录（升级迁移用） */
export function clearLegacyAuthStorage() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
