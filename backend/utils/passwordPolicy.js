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

/**
 * @returns {Promise<{ ok: true, hash: string, plain: string } | { ok: false, message: string }>}
 */
async function preparePasswordStorage(plain) {
  const hp = await hashPassword(plain);
  if (!hp.ok) {
    return hp;
  }
  return { ok: true, hash: hp.hash, plain: String(plain) };
}

/**
 * 初始密码（学号）可仅为数字，仍使用 bcrypt 加密存储
 * @param {unknown} plain
 */
function validateInitialStudentPassword(plain) {
  if (plain == null || String(plain).trim() === '') {
    return { ok: false, message: '学号不能为空，无法生成初始密码' };
  }
  const s = String(plain).trim();
  if (s.length < 4) {
    return { ok: false, message: '学号过短，无法作为初始密码' };
  }
  if (s.length > 64) {
    return { ok: false, message: '学号过长' };
  }
  return { ok: true };
}

/**
 * @returns {Promise<{ ok: true, hash: string } | { ok: false, message: string }>}
 */
async function hashInitialStudentPassword(plain) {
  const v = validateInitialStudentPassword(plain);
  if (!v.ok) return v;
  try {
    const hash = await bcrypt.hash(String(plain).trim(), BCRYPT_ROUNDS);
    return { ok: true, hash };
  } catch (e) {
    console.error('[passwordPolicy] hashInitialStudentPassword failed:', e.message);
    return { ok: false, message: '密码处理失败，请稍后重试' };
  }
}

/**
 * 初始密码（工号）校验
 * @param {unknown} plain
 */
function validateInitialTeacherPassword(plain) {
  if (plain == null || String(plain).trim() === '') {
    return { ok: false, message: '工号不能为空，无法生成初始密码' };
  }
  const s = String(plain).trim();
  if (s.length < 4) {
    return { ok: false, message: '工号过短，无法作为初始密码' };
  }
  if (s.length > 64) {
    return { ok: false, message: '工号过长' };
  }
  return { ok: true };
}

/**
 * @returns {Promise<{ ok: true, hash: string } | { ok: false, message: string }>}
 */
async function hashInitialTeacherPassword(plain) {
  const v = validateInitialTeacherPassword(plain);
  if (!v.ok) return v;
  try {
    const hash = await bcrypt.hash(String(plain).trim(), BCRYPT_ROUNDS);
    return { ok: true, hash };
  } catch (e) {
    console.error('[passwordPolicy] hashInitialTeacherPassword failed:', e.message);
    return { ok: false, message: '密码处理失败，请稍后重试' };
  }
}

module.exports = {
  BCRYPT_ROUNDS,
  PASSWORD_HINT,
  validatePasswordPlaintext,
  validateInitialStudentPassword,
  validateInitialTeacherPassword,
  hashPassword,
  hashInitialStudentPassword,
  hashInitialTeacherPassword,
  verifyPassword,
  preparePasswordStorage,
};
