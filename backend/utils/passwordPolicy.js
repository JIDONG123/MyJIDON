const bcrypt = require('bcryptjs');

/** bcrypt 成本因子，默认 10（bcrypt 内置随机盐，盐值写入哈希串，不可逆） */
const BCRYPT_ROUNDS = (() => {
  const n = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
  if (!Number.isFinite(n)) return 10;
  return Math.min(15, Math.max(4, n));
})();

const PASSWORD_HINT = '密码至少 6 位，且须同时包含英文字母与数字';

/**
 * 明文密码复杂度（注册 / 管理员创建账号）
 * @param {unknown} plain
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function validatePasswordPlaintext(plain) {
  if (plain == null || typeof plain !== 'string') {
    return { ok: false, message: '请填写密码' };
  }
  const s = plain;
  if (s.length < 6) {
    return { ok: false, message: PASSWORD_HINT };
  }
  const hasLetter = /[A-Za-z]/.test(s);
  const hasDigit = /\d/.test(s);
  if (!hasLetter || !hasDigit) {
    return { ok: false, message: PASSWORD_HINT };
  }
  return { ok: true };
}

/**
 * @returns {Promise<{ ok: true, hash: string } | { ok: false, message: string }>}
 */
async function hashPassword(plain) {
  const v = validatePasswordPlaintext(plain);
  if (!v.ok) {
    return { ok: false, message: v.message };
  }
  try {
    const hash = await bcrypt.hash(plain, BCRYPT_ROUNDS);
    return { ok: true, hash };
  } catch (e) {
    console.error('[passwordPolicy] bcrypt.hash failed:', e.message);
    return { ok: false, message: '密码处理失败，请稍后重试' };
  }
}

/**
 * 登录比对（异常吞掉，返回 false，由上层统一模糊提示）
 * @param {string} plain
 * @param {string} storedHash
 */
async function verifyPassword(plain, storedHash) {
  if (plain == null || storedHash == null) {
    return false;
  }
  try {
    return await bcrypt.compare(String(plain), String(storedHash));
  } catch (e) {
    console.warn('[passwordPolicy] bcrypt.compare failed:', e.message);
    return false;
  }
}

module.exports = {
  BCRYPT_ROUNDS,
  PASSWORD_HINT,
  validatePasswordPlaintext,
  hashPassword,
  verifyPassword,
};
