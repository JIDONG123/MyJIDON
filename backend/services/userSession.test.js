/**
 * node --test services/userSession.test.js
 */
require('../config/loadEnv').loadEnv();

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const {
  createUserSession,
  validateUserSession,
  logoutUserSession,
  isSingleSessionEnabled,
  SESSION_KICKED_MESSAGE,
  clearActiveSessionRedis,
} = require('./userSessionService');

let tableReady = false;
let sampleUserId = null;
const prevSingleSession = process.env.SINGLE_SESSION_ENABLED;

before(async () => {
  process.env.SINGLE_SESSION_ENABLED = '1';
  const [tables] = await pool.query(`SHOW TABLES LIKE 'user_sessions'`);
  tableReady = tables.length > 0;
  if (!tableReady) return;
  const [users] = await pool.query(
    `SELECT id FROM users WHERE IFNULL(is_disabled, 0) = 0 ORDER BY id LIMIT 1`
  );
  sampleUserId = users[0]?.id ?? null;
});

after(() => {
  if (prevSingleSession == null) delete process.env.SINGLE_SESSION_ENABLED;
  else process.env.SINGLE_SESSION_ENABLED = prevSingleSession;
});

function signToken(userId, sessionId) {
  return jwt.sign(
    { id: userId, username: 'test', role: 'admin', sessionId },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('isSingleSessionEnabled defaults to true', () => {
  process.env.SINGLE_SESSION_ENABLED = '1';
  assert.equal(isSingleSessionEnabled(), true);
  process.env.SINGLE_SESSION_ENABLED = '0';
  assert.equal(isSingleSessionEnabled(), false);
  process.env.SINGLE_SESSION_ENABLED = '1';
});

test('createUserSession + validateUserSession accepts active token', async () => {
  if (!tableReady || !sampleUserId) return;
  const uid = Number(sampleUserId);
  await clearActiveSessionRedis(uid);

  const first = await createUserSession(pool, { userId: uid, loginIp: '127.0.0.1', userAgent: 'test-agent' });
  const check = await validateUserSession(pool, { id: uid, sessionId: first.sessionId });
  assert.equal(check.ok, true);
});

test('second login kicks first session token', async () => {
  if (!tableReady || !sampleUserId) return;
  const uid = Number(sampleUserId);
  await clearActiveSessionRedis(uid);

  const first = await createUserSession(pool, { userId: uid, loginIp: '127.0.0.1', userAgent: 'browser-a' });
  const second = await createUserSession(pool, { userId: uid, loginIp: '127.0.0.2', userAgent: 'browser-b' });

  const oldCheck = await validateUserSession(pool, { id: uid, sessionId: first.sessionId });
  assert.equal(oldCheck.ok, false);
  assert.equal(oldCheck.code, 'SESSION_KICKED');
  assert.equal(oldCheck.message, SESSION_KICKED_MESSAGE);

  const newCheck = await validateUserSession(pool, { id: uid, sessionId: second.sessionId });
  assert.equal(newCheck.ok, true);
});

test('old session logout does not clear new active session', async () => {
  if (!tableReady || !sampleUserId) return;
  const uid = Number(sampleUserId);
  await clearActiveSessionRedis(uid);

  const first = await createUserSession(pool, { userId: uid, loginIp: '127.0.0.1', userAgent: 'a' });
  const second = await createUserSession(pool, { userId: uid, loginIp: '127.0.0.2', userAgent: 'b' });

  const logoutOld = await logoutUserSession(pool, uid, first.sessionId);
  assert.equal(logoutOld.cleared, false);

  const stillActive = await validateUserSession(pool, { id: uid, sessionId: second.sessionId });
  assert.equal(stillActive.ok, true);
});

test('logout clears current active session', async () => {
  if (!tableReady || !sampleUserId) return;
  const uid = Number(sampleUserId);
  await clearActiveSessionRedis(uid);

  const session = await createUserSession(pool, { userId: uid, loginIp: '127.0.0.1', userAgent: 'logout-test' });
  const logoutRes = await logoutUserSession(pool, uid, session.sessionId);
  assert.equal(logoutRes.cleared, true);

  const check = await validateUserSession(pool, { id: uid, sessionId: session.sessionId });
  assert.equal(check.ok, false);
  assert.equal(check.code, 'SESSION_EXPIRED');
});

test('SINGLE_SESSION_ENABLED=0 skips session validation', async () => {
  process.env.SINGLE_SESSION_ENABLED = '0';
  const check = await validateUserSession(pool, { id: 1, sessionId: 'any-random' });
  assert.equal(check.ok, true);
  process.env.SINGLE_SESSION_ENABLED = '1';
});

test('token without sessionId is rejected when single session enabled', async () => {
  process.env.SINGLE_SESSION_ENABLED = '1';
  const check = await validateUserSession(pool, { id: sampleUserId || 1 });
  assert.equal(check.ok, false);
  assert.equal(check.code, 'SESSION_EXPIRED');
});

test('student teacher admin roles share same session mechanism', async () => {
  if (!tableReady) return;
  for (const role of ['student', 'teacher', 'admin']) {
    const [rows] = await pool.query(
      `SELECT id FROM users WHERE role = ? AND IFNULL(is_disabled, 0) = 0 LIMIT 1`,
      [role]
    );
    if (!rows.length) continue;
    const uid = Number(rows[0].id);
    await clearActiveSessionRedis(uid);
    const session = await createUserSession(pool, { userId: uid, loginIp: '127.0.0.1', userAgent: role });
    const check = await validateUserSession(pool, { id: uid, sessionId: session.sessionId });
    assert.equal(check.ok, true, `role ${role} should accept active session`);
    await logoutUserSession(pool, uid, session.sessionId);
  }
});
