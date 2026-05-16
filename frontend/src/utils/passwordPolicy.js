/** 与后端 `backend/utils/passwordPolicy.js` 策略一致（前端预检，最终以服务端为准） */
export const PASSWORD_HINT = '密码至少 6 位，且须同时包含英文字母与数字'

/**
 * @param {unknown} plain
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validatePasswordPlaintext(plain) {
  if (plain == null || typeof plain !== 'string') {
    return { ok: false, message: '请填写密码' }
  }
  if (plain.length < 6) {
    return { ok: false, message: PASSWORD_HINT }
  }
  if (!/[A-Za-z]/.test(plain) || !/\d/.test(plain)) {
    return { ok: false, message: PASSWORD_HINT }
  }
  return { ok: true }
}
