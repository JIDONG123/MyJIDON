/** 登录 / 重置密码跨标签页通知（同源标签页） */
export const AUTH_TAB_CHANNEL = 'sg-auth-channel'
export const LOGIN_WINDOW_NAME = 'sg-login-portal'

function postAuthTabEvent(message) {
  try {
    const bc = new BroadcastChannel(AUTH_TAB_CHANNEL)
    bc.postMessage(message)
    bc.close()
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem('sg:auth-tab-event', JSON.stringify(message))
    localStorage.removeItem('sg:auth-tab-event')
  } catch {
    /* ignore */
  }
}

export function notifyLoginTab(payload = {}) {
  postAuthTabEvent({ type: 'password-reset-success', ts: Date.now(), ...payload })
}

export function onLoginTabEvent(handler) {
  let bc = null
  const onStorage = (e) => {
    if (e.key !== 'sg:auth-tab-event' || !e.newValue) return
    try {
      handler(JSON.parse(e.newValue))
    } catch {
      /* ignore */
    }
  }
  try {
    bc = new BroadcastChannel(AUTH_TAB_CHANNEL)
    bc.onmessage = (e) => {
      if (e?.data) handler(e.data)
    }
  } catch {
    /* ignore */
  }
  window.addEventListener('storage', onStorage)
  return () => {
    if (bc) {
      bc.close()
      bc = null
    }
    window.removeEventListener('storage', onStorage)
  }
}

/** 请求原登录标签页聚焦（用户点击「返回原登录页」） */
export function requestFocusLoginTab() {
  postAuthTabEvent({
    type: 'focus-login-tab',
    ts: Date.now(),
    message: '密码已重置，请使用新密码登录',
  })

  const loginUrl = `${window.location.origin}/login?reset=success`

  if (window.opener && !window.opener.closed) {
    try {
      window.opener.focus()
      window.opener.location.href = loginUrl
      window.close()
      return true
    } catch {
      /* fall through */
    }
  }

  try {
    const existing = window.open(loginUrl, LOGIN_WINDOW_NAME)
    if (existing) {
      existing.focus()
      window.close()
      return true
    }
  } catch {
    /* ignore */
  }

  try {
    window.close()
  } catch {
    /* ignore */
  }

  return false
}

/** 重置成功后：通知原登录标签页并尝试关闭当前标签 */
export function finishPasswordReset(message) {
  notifyLoginTab({ message })

  const loginUrl = `${window.location.origin}/login?reset=success`

  if (window.opener && !window.opener.closed) {
    try {
      window.opener.focus()
      window.opener.location.href = loginUrl
      window.close()
      return { mode: 'opener' }
    } catch {
      /* fall through */
    }
  }

  try {
    const existing = window.open(loginUrl, LOGIN_WINDOW_NAME)
    if (existing) {
      existing.focus()
      window.close()
      return { mode: 'named-window' }
    }
  } catch {
    /* ignore */
  }

  try {
    window.close()
  } catch {
    /* ignore */
  }

  return { mode: 'notify' }
}
