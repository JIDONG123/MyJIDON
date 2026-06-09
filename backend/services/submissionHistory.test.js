/**
 * node --test services/submissionHistory.test.js
 */
require('../config/loadEnv').loadEnv();

const { test } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../config/database');
const { listSubmissionHistory } = require('./submissionHistoryService');

test('listSubmissionHistory returns structure for existing submission', async () => {
  const [rows] = await pool.query('SELECT id, student_id FROM submissions ORDER BY id DESC LIMIT 1');
  if (!rows.length) return;
  const sub = rows[0];
  const data = await listSubmissionHistory(sub.id, sub.student_id, 'student');
  assert.ok(data.submissionId);
  assert.ok(Array.isArray(data.items));
  assert.equal(typeof data.currentVersion, 'number');
  assert.equal(data.currentLabel, '当前生效');
});

test('student cannot view others history', async () => {
  const [rows] = await pool.query(
    `SELECT s.id, s.student_id FROM submissions s ORDER BY s.id DESC LIMIT 5`
  );
  if (rows.length < 2) return;
  const target = rows[0];
  const otherStudent = rows.find((r) => Number(r.student_id) !== Number(target.student_id));
  if (!otherStudent) return;
  await assert.rejects(
    () => listSubmissionHistory(target.id, otherStudent.student_id, 'student'),
    (e) => e.status === 403
  );
});
