const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { safeGet, safeSet, safeDel } = require('../utils/redisClient');

const PREFIX = (process.env.CACHE_KEY_PREFIX || 'sg:') + 'auth:active-session:';

const SESSION_KICKED_MESSAGE = '账号已在其他设备登录，当前会话已下线。';
const SESSION_EXPIRED_MESSAGE = '登录状态已过期，请重新登录。';

function isSingleSessionEnabled() {
  const v = process.env.SINGLE_SESSION_ENABLED;
  if (v === '0' || v === 'false') return false;
  return true;
}

function isSessionKickNotifyEnabled() {
  const v = process.env.SESSION_KICK_NOTIFY_ENABLED;
  if (v === '0' || v === 'false') return false;
  return true;
}

function parseJwtExpiresSeconds() {
  const raw = String(process.env.JWT_EXPIRES_IN || '8h').trim();
  const m = raw.match(/^(\d+)([smhd])?$/i);
  if (!m) return 8 * 3600;
  const n = parseInt(m[1], 10);
  const unit = (m[2] || 's').toLowerCase();
  const mult = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (mult[unit] || 1);
}

function redisKey(userId) {
  return `${PREFIX}${userId}`;
}

function summarizeDevice(userAgent) {
  const ua = String(userAgent || '').trim();
  if (!ua) return '未知设备';
  let browser = '浏览器';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';

  let os = '未知系统';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad/i.test(ua)) os = 'iOS';

  return `${browser} / ${os}`;
}

function logAuthEvent(line) {
  const dir = path.join(__dirname, '..', 'logs', 'auth');
  const text = `${new Date().toISOString()} ${line}\n`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'sessions.log'), text);
  } catch {
    /* ignore */
  }
  if (process.env.NODE_ENV !== 'production') {
    console.info('[auth-session]', line);
  }
}

async function readActiveSessionFromRedis(userId) {
  const raw = await safeGet(redisKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeActiveSessionToRedis(userId, payload) {
  const ttl = parseJwtExpiresSeconds();
  await safeSet(redisKey(userId), JSON.stringify(payload), 'EX', ttl);
}

async function clearActiveSessionRedis(userId) {
  await safeDel(redisKey(userId));
}

async function readActiveSessionFromDb(pool, userId) {
  const [rows] = await pool.query(
    `SELECT session_id AS sessionId, login_ip AS loginIp, user_agent AS userAgent,
            device_label AS deviceLabel, login_at AS loginAt
     FROM user_sessions
     WHERE user_id = ? AND status = 'active'
     ORDER BY login_at DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function markPreviousSessionsKicked(pool, userId) {
  const [rows] = await pool.query(
    `SELECT session_id FROM user_sessions WHERE user_id = ? AND status = 'active'`,
    [userId]
  );
  if (!rows.length) return [];

  await pool.query(
    `UPDATE user_sessions
     SET status = 'kicked', kicked_at = NOW(), updated_at = NOW()
     WHERE user_id = ? AND status = 'active'`,
    [userId]
  );
  return rows.map((r) => r.session_id);
}

async function insertActiveSession(pool, data) {
  await pool.query(
    `INSERT INTO user_sessions
      (user_id, session_id, status, login_ip, user_agent, device_label, login_at, last_seen_at)
     VALUES (?, ?, 'active', ?, ?, ?, NOW(), NOW())`,
    [data.userId, data.sessionId, data.loginIp || null, data.userAgent || null, data.deviceLabel || null]
  );
}

function emitSessionKicked(sessionId) {
  if (!isSessionKickNotifyEnabled() || !sessionId) return;
  try {
    const { getIO } = require('../utils/realtimeEmit');
    const io = getIO();
    if (io) {
      io.to(`sess:${sessionId}`).emit('auth:kicked', {
        code: 'SESSION_KICKED',
        message: SESSION_KICKED_MESSAGE,
      });
    }
    const emitterMod = require('../utils/socketIoEmitter');
    const emitter = typeof emitterMod.getSocketIoEmitter === 'function' ? emitterMod.getSocketIoEmitter() : null;
    if (emitter) {
      emitter.to(`sess:${sessionId}`).emit('auth:kicked', {
        code: 'SESSION_KICKED',
        message: SESSION_KICKED_MESSAGE,
      });
    }
  } catch (e) {
    console.warn('[auth-session] kick notify failed:', e?.message || e);
  }
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
async function createUserSession(pool, { userId, loginIp, userAgent }) {
  const sessionId = crypto.randomUUID();
  const deviceLabel = summarizeDevice(userAgent);
  const kickedSessionIds = await markPreviousSessionsKicked(pool, userId);

  await insertActiveSession(pool, {
    userId,
    sessionId,
    loginIp,
    userAgent: userAgent ? String(userAgent).slice(0, 512) : null,
    deviceLabel,
  });

  const payload = {
    sessionId,
    loginAt: new Date().toISOString(),
    loginIp: loginIp || null,
    userAgent: userAgent ? String(userAgent).slice(0, 200) : null,
    deviceLabel,
  };
  await writeActiveSessionToRedis(userId, payload);

  for (const oldId of kickedSessionIds) {
    if (oldId && oldId !== sessionId) {
      emitSessionKicked(oldId);
      logAuthEvent(`kicked user=${userId} oldSession=${oldId} newSession=${sessionId}`);
    }
  }
  logAuthEvent(`login_success user=${userId} session=${sessionId} ip=${loginIp || '-'}`);

  return { sessionId, deviceLabel };
}

/**
 * @param {{ id?: number, sessionId?: string }} userPayload
 */
async function validateUserSession(pool, userPayload) {
  if (!isSingleSessionEnabled()) {
    return { ok: true };
  }

  const userId = Number(userPayload?.id);
  const tokenSessionId = String(userPayload?.sessionId || '').trim();

  if (!Number.isFinite(userId) || userId <= 0) {
    return { ok: false, code: 'SESSION_EXPIRED', message: SESSION_EXPIRED_MESSAGE };
  }
  if (!tokenSessionId) {
    return { ok: false, code: 'SESSION_EXPIRED', message: SESSION_EXPIRED_MESSAGE };
  }

  let active = await readActiveSessionFromRedis(userId);
  if (!active) {
    const dbActive = await readActiveSessionFromDb(pool, userId);
    if (dbActive?.sessionId) {
      active = {
        sessionId: dbActive.sessionId,
        loginAt: dbActive.loginAt ? new Date(dbActive.loginAt).toISOString() : null,
        loginIp: dbActive.loginIp || null,
        userAgent: dbActive.userAgent || null,
        deviceLabel: dbActive.deviceLabel || null,
      };
      await writeActiveSessionToRedis(userId, active);
    }
  }

  if (!active?.sessionId) {
    return { ok: false, code: 'SESSION_EXPIRED', message: SESSION_EXPIRED_MESSAGE };
  }

  if (String(active.sessionId) !== tokenSessionId) {
    logAuthEvent(`session_kicked_request user=${userId} tokenSession=${tokenSessionId} active=${active.sessionId}`);
    return { ok: false, code: 'SESSION_KICKED', message: SESSION_KICKED_MESSAGE };
  }

  return { ok: true };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
async function logoutUserSession(pool, userId, sessionId) {
  const uid = Number(userId);
  const sid = String(sessionId || '').trim();
  if (!Number.isFinite(uid) || uid <= 0 || !sid) {
    return { ok: false, reason: 'invalid' };
  }

  const active = (await readActiveSessionFromRedis(uid)) || (await readActiveSessionFromDb(pool, uid));
  if (!active?.sessionId || String(active.sessionId) !== sid) {
    logAuthEvent(`logout_ignored user=${uid} session=${sid} active=${active?.sessionId || '-'}`);
    return { ok: true, cleared: false };
  }

  await clearActiveSessionRedis(uid);
  await pool.query(
    `UPDATE user_sessions
     SET status = 'logout', logout_at = NOW(), updated_at = NOW()
     WHERE user_id = ? AND session_id = ? AND status = 'active'`,
    [uid, sid]
  );
  logAuthEvent(`logout_success user=${uid} session=${sid}`);
  return { ok: true, cleared: true };
}

module.exports = {
  SESSION_KICKED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  isSingleSessionEnabled,
  isSessionKickNotifyEnabled,
  parseJwtExpiresSeconds,
  summarizeDevice,
  createUserSession,
  validateUserSession,
  logoutUserSession,
  emitSessionKicked,
  readActiveSessionFromRedis,
  writeActiveSessionToRedis,
  clearActiveSessionRedis,
};
