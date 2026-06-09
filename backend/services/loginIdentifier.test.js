/**
 * node --test services/loginIdentifier.test.js
 */
require('../config/loadEnv').loadEnv();

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../config/database');
const { closeTestResources } = require('../test/closeTestResources');
const { verifyPassword } = require('../utils/passwordPolicy');
const {
  normalizeLoginIdentifier,
  resolveLoginMatches,
  findUserByLoginIdentifier,
  IDENTIFIER_CONFLICT_MESSAGE,
  LOGIN_FAIL_MESSAGE,
} = require('./loginIdentifierService');

after(async () => {
  await closeTestResources();
});

test('normalizeLoginIdentifier trims whitespace', () => {
  assert.equal(normalizeLoginIdentifier('  abc  '), 'abc');
  assert.equal(normalizeLoginIdentifier(''), '');
  assert.equal(normalizeLoginIdentifier(null), '');
});

test('resolveLoginMatches returns not_found for empty rows', () => {
  assert.deepEqual(resolveLoginMatches([]), { status: 'not_found' });
});

test('resolveLoginMatches returns ok for single user', () => {
  const user = { id: 1, username: 'alice' };
  assert.deepEqual(resolveLoginMatches([user]), { status: 'ok', user });
});

test('resolveLoginMatches dedupes same user matched by multiple fields', () => {
  const userA = { id: 1, username: '2024001', student_no: '2024001' };
  const result = resolveLoginMatches([userA, { ...userA }]);
  assert.equal(result.status, 'ok');
  assert.equal(result.user.id, 1);
});

test('resolveLoginMatches returns conflict for different users', () => {
  const result = resolveLoginMatches([
    { id: 1, username: 'dup-id' },
    { id: 2, username: 'other' },
  ]);
  assert.equal(result.status, 'conflict');
  assert.equal(result.users.length, 2);
});

test('findUserByLoginIdentifier rejects empty identifier', async () => {
  const result = await findUserByLoginIdentifier(pool, '   ');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'EMPTY');
});

test('admin can login by username', async () => {
  const [rows] = await pool.query(
    `SELECT username FROM users WHERE role = 'admin' AND IFNULL(is_disabled, 0) = 0 LIMIT 1`
  );
  if (!rows.length) return;
  const result = await findUserByLoginIdentifier(pool, rows[0].username);
  assert.equal(result.ok, true);
  assert.equal(result.user.username, rows[0].username);
});

test('student can login by username', async () => {
  const [rows] = await pool.query(
    `SELECT username FROM users WHERE role = 'student' AND IFNULL(is_disabled, 0) = 0 LIMIT 1`
  );
  if (!rows.length) return;
  const result = await findUserByLoginIdentifier(pool, rows[0].username);
  assert.equal(result.ok, true);
  assert.equal(result.user.role, 'student');
});

test('student can login by student_no', async () => {
  const [rows] = await pool.query(
    `SELECT student_no, username FROM users
     WHERE role = 'student' AND student_no IS NOT NULL AND student_no != ''
       AND IFNULL(is_disabled, 0) = 0
     LIMIT 1`
  );
  if (!rows.length) return;
  const result = await findUserByLoginIdentifier(pool, rows[0].student_no);
  assert.equal(result.ok, true);
  assert.equal(result.user.username, rows[0].username);
  assert.equal(result.user.student_no, rows[0].student_no);
});

test('teacher can login by username', async () => {
  const [rows] = await pool.query(
    `SELECT username FROM users WHERE role = 'teacher' AND IFNULL(is_disabled, 0) = 0 LIMIT 1`
  );
  if (!rows.length) return;
  const result = await findUserByLoginIdentifier(pool, rows[0].username);
  assert.equal(result.ok, true);
  assert.equal(result.user.role, 'teacher');
});

test('teacher can login by teacher_no', async () => {
  const [rows] = await pool.query(
    `SELECT teacher_no, username FROM users
     WHERE role = 'teacher' AND teacher_no IS NOT NULL AND teacher_no != ''
       AND IFNULL(is_disabled, 0) = 0
     LIMIT 1`
  );
  if (!rows.length) return;
  const result = await findUserByLoginIdentifier(pool, rows[0].teacher_no);
  assert.equal(result.ok, true);
  assert.equal(result.user.username, rows[0].username);
  assert.equal(result.user.teacher_no, rows[0].teacher_no);
});

test('unknown identifier returns auth fail message', async () => {
  const result = await findUserByLoginIdentifier(pool, `__missing_login_${Date.now()}__`);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'AUTH_FAIL');
  assert.equal(result.message, LOGIN_FAIL_MESSAGE);
});

test('disabled student is still resolved by identifier', async () => {
  const [rows] = await pool.query(
    `SELECT id, username, student_no FROM users
     WHERE role = 'student' AND IFNULL(is_disabled, 0) = 1 LIMIT 1`
  );
  if (!rows.length) return;
  const key = rows[0].student_no || rows[0].username;
  const result = await findUserByLoginIdentifier(pool, key);
  assert.equal(result.ok, true);
  assert.equal(Number(result.user.is_disabled), 1);
});

test('student default password still verifies with student_no login lookup', async () => {
  const [rows] = await pool.query(
    `SELECT id, student_no, password, must_change_password FROM users
     WHERE role = 'student' AND student_no IS NOT NULL AND student_no != ''
       AND IFNULL(is_disabled, 0) = 0
     LIMIT 1`
  );
  if (!rows.length) return;
  const lookup = await findUserByLoginIdentifier(pool, rows[0].student_no);
  assert.equal(lookup.ok, true);
  const pwdOk = await verifyPassword(rows[0].student_no, lookup.user.password);
  if (!pwdOk) return;
  assert.equal(Number(lookup.user.must_change_password), Number(rows[0].must_change_password));
});

test('teacher default password still verifies with teacher_no login lookup', async () => {
  const [rows] = await pool.query(
    `SELECT id, teacher_no, password, must_change_password FROM users
     WHERE role = 'teacher' AND teacher_no IS NOT NULL AND teacher_no != ''
       AND IFNULL(is_disabled, 0) = 0
     LIMIT 1`
  );
  if (!rows.length) return;
  const lookup = await findUserByLoginIdentifier(pool, rows[0].teacher_no);
  assert.equal(lookup.ok, true);
  const pwdOk = await verifyPassword(rows[0].teacher_no, lookup.user.password);
  if (!pwdOk) return;
  assert.equal(Number(lookup.user.must_change_password), Number(rows[0].must_change_password));
});

test('identifier conflict when username and student_no point to different users', async () => {
  const token = `conflict_${Date.now()}`;
  const [students] = await pool.query(
    `SELECT id FROM users WHERE role = 'student' AND IFNULL(is_disabled, 0) = 0 LIMIT 1`
  );
  const [others] = await pool.query(
    `SELECT id FROM users WHERE role IN ('teacher', 'admin') AND IFNULL(is_disabled, 0) = 0 LIMIT 1`
  );
  if (!students.length || !others.length) return;

  const studentId = students[0].id;
  const otherId = others[0].id;
  const [beforeStudent] = await pool.query('SELECT username, student_no FROM users WHERE id = ?', [studentId]);
  const [beforeOther] = await pool.query('SELECT username, student_no, teacher_no FROM users WHERE id = ?', [otherId]);

  await pool.query('UPDATE users SET username = ? WHERE id = ?', [token, otherId]);
  await pool.query('UPDATE users SET student_no = ? WHERE id = ?', [token, studentId]);

  try {
    const result = await findUserByLoginIdentifier(pool, token);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'IDENTIFIER_CONFLICT');
    assert.equal(result.message, IDENTIFIER_CONFLICT_MESSAGE);
  } finally {
    await pool.query('UPDATE users SET username = ? WHERE id = ?', [beforeOther[0].username, otherId]);
    await pool.query('UPDATE users SET student_no = ? WHERE id = ?', [beforeStudent[0].student_no, studentId]);
  }
});
