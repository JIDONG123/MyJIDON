const crypto = require('crypto');
const pool = require('../config/database');
const { ensureConnected } = require('./redisClient');
const { sendPasswordResetEmail } = require('./mailService');
const { preparePasswordStorage } = require('./passwordPolicy');

const PREFIX = (process.env.CACHE_KEY_PREFIX || 'sg:') + 'pwd-reset:';
const TOKEN_TTL_SEC = parseInt(process.env.PWD_RESET_TOKEN_TTL_SEC || '900', 10);
const RATE_TTL_SEC = parseInt(process.env.PWD_RESET_RATE_TTL_SEC || '120', 10);

function publicAppUrl() {
  const url = (process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (url) return url;
  if (process.env.NODE_ENV === 'production') {
    return '';
  }
  return 'http://localhost:5173';
}

function tokenKey(token) {
  return `${PREFIX}token:${token}`;
}

function rateKey(userId) {
  return `${PREFIX}rate:${userId}`;
}

async function requireRedis() {
  const c = await ensureConnected();
  if (!c) {
    const err = new Error('密码重置服务暂不可用，请确认 Redis 已启动');
    err.status = 503;
    throw err;
  }
  return c;
}

async function findUserByUsernameEmail(username, email) {
  const u = String(username || '').trim();
  const e = String(email || '').trim().toLowerCase();
  if (!u || !e) {
    return null;
  }
  const [rows] = await pool.query(
    `SELECT id, username, real_name, email, role, IFNULL(is_disabled, 0) AS is_disabled
     FROM users WHERE username = ? LIMIT 1`,
    [u]
  );
  if (!rows.length) {
    return null;
  }
  const user = rows[0];
  const dbEmail = user.email ? String(user.email).trim().toLowerCase() : '';
  if (!dbEmail || dbEmail !== e) {
    return null;
  }
  return user;
}

async function requestPasswordReset({ username, email }) {
  const user = await findUserByUsernameEmail(username, email);
  if (!user) {
    const err = new Error('用户名与绑定邮箱不匹配，请核对后重试');
    err.status = 400;
    throw err;
  }
  if (Number(user.is_disabled) === 1) {
    const err = new Error('该账号已被禁用，无法重置密码');
    err.status = 403;
    throw err;
  }

  const redis = await requireRedis();
  const rk = rateKey(user.id);
  const rateOk = await redis.set(rk, '1', 'EX', RATE_TTL_SEC, 'NX');
  if (rateOk !== 'OK') {
    const err = new Error('发送过于频繁，请 2 分钟后再试');
    err.status = 429;
    throw err;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const payload = JSON.stringify({
    userId: Number(user.id),
    username: user.username,
    email: user.email,
  });
  await redis.set(tokenKey(token), payload, 'EX', TOKEN_TTL_SEC);

  const base = publicAppUrl();
  if (!base) {
    const err = new Error('未配置 PUBLIC_APP_URL，无法生成重置链接');
    err.status = 503;
    throw err;
  }
  const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;

  try {
    await sendPasswordResetEmail({
      to: user.email,
      realName: user.real_name,
      username: user.username,
      resetUrl,
      expireMinutes: Math.floor(TOKEN_TTL_SEC / 60),
    });
  } catch (mailErr) {
    await redis.del(rk);
    await redis.del(tokenKey(token));
    throw mailErr;
  }

  return { success: true, message: '重置邮件已发送，请前往邮箱查收（15 分钟内有效）' };
}

async function consumeResetToken(token) {
  const redis = await requireRedis();
  const raw = await redis.get(tokenKey(token));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function resetPasswordWithToken({ token, newPassword, confirmPassword }) {
  if (!token || String(token).trim() === '') {
    const err = new Error('重置链接无效或已过期');
    err.status = 400;
    throw err;
  }
  if (newPassword !== confirmPassword) {
    const err = new Error('两次输入的新密码不一致');
    err.status = 400;
    throw err;
  }

  const meta = await consumeResetToken(String(token).trim());
  if (!meta || !meta.userId) {
    const err = new Error('重置链接无效或已过期');
    err.status = 400;
    throw err;
  }

  const prep = await preparePasswordStorage(newPassword);
  if (!prep.ok) {
    const err = new Error(prep.message);
    err.status = 400;
    throw err;
  }

  const [rows] = await pool.query(
    'SELECT id, IFNULL(is_disabled, 0) AS is_disabled FROM users WHERE id = ? LIMIT 1',
    [meta.userId]
  );
  if (!rows.length) {
    const err = new Error('账号不存在');
    err.status = 404;
    throw err;
  }
  if (Number(rows[0].is_disabled) === 1) {
    const err = new Error('该账号已被禁用');
    err.status = 403;
    throw err;
  }

  await pool.query('UPDATE users SET password = ?, password_plain = ? WHERE id = ?', [
    prep.hash,
    prep.plain,
    meta.userId,
  ]);

  const redis = await requireRedis();
  await redis.del(tokenKey(String(token).trim()));

  try {
    const cache = require('./cacheService');
    await cache.invalidateUserMe(meta.userId);
  } catch {
    /* ignore */
  }

  return { success: true, message: '密码已重置，请使用新密码登录' };
}

module.exports = {
  requestPasswordReset,
  resetPasswordWithToken,
};
