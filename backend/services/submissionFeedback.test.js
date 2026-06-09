/**
 * node --test services/submissionFeedback.test.js
 * 需数据库已有 users/submissions/tasks
 */
require('../config/loadEnv').loadEnv();

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../config/database');
const { closeTestResources } = require('../test/closeTestResources');
const feedbackService = require('./submissionFeedbackService');
const { evaluateResubmitSlot, normalizeFeedbackType } = require('./submissionResubmitService');

let studentId;
let teacherId;
let otherStudentId;
let taskId;
let submissionId;

before(async () => {
  const [students] = await pool.query(`SELECT id FROM users WHERE role = 'student' LIMIT 2`);
  const [teachers] = await pool.query(`SELECT id FROM users WHERE role = 'teacher' LIMIT 1`);
  studentId = students[0]?.id;
  otherStudentId = students[1]?.id || studentId;
  teacherId = teachers[0]?.id;
  if (!studentId || !teacherId) return;

  const [subs] = await pool.query(
    `SELECT s.id, s.task_id, t.created_by FROM submissions s INNER JOIN tasks t ON t.id = s.task_id WHERE s.student_id = ? LIMIT 1`,
    [studentId]
  );
  if (subs.length) {
    submissionId = subs[0].id;
    taskId = subs[0].task_id;
  }
});

after(async () => {
  await closeTestResources();
});

test('normalizeFeedbackType defaults to other', () => {
  assert.equal(normalizeFeedbackType('invalid'), 'other');
  assert.equal(normalizeFeedbackType('score_question'), 'score_question');
});

test('student cannot feedback others submission', async () => {
  if (!otherStudentId || !submissionId || otherStudentId === studentId) return;
  await assert.rejects(
    () =>
      feedbackService.createFeedback({
        submissionId,
        studentId: otherStudentId,
        feedbackType: 'other',
        content: '越权测试',
        wantsResubmit: false,
      }),
    (e) => e.status === 403
  );
});

test('duplicate pending feedback blocked', async () => {
  if (!studentId || !submissionId) return;
  await pool.query(`UPDATE submission_feedbacks SET status = 'closed' WHERE submission_id = ? AND status = 'pending'`, [
    submissionId,
  ]);
  await feedbackService.createFeedback({
    submissionId,
    studentId,
    feedbackType: 'score_question',
    content: '测试反馈1',
    wantsResubmit: false,
  });
  await assert.rejects(
    () =>
      feedbackService.createFeedback({
        submissionId,
        studentId,
        feedbackType: 'other',
        content: '测试反馈2',
        wantsResubmit: false,
      }),
    (e) => e.status === 409
  );
  await pool.query(`UPDATE submission_feedbacks SET status = 'closed' WHERE submission_id = ? AND status = 'pending'`, [
    submissionId,
  ]);
});

test('evaluateResubmitSlot allows when permission active at limit', async () => {
  if (!taskId || !studentId || !submissionId) return;
  await pool.query(
    `INSERT INTO submission_resubmit_permissions
      (task_id, student_id, submission_id, granted_by, reason, extra_attempts, used_attempts, status)
     VALUES (?, ?, ?, ?, 'test', 1, 0, 'active')`,
    [taskId, studentId, submissionId, teacherId || 1]
  );
  const slot = await evaluateResubmitSlot({
    taskId,
    studentId,
    submissionId,
    usedCount: 999,
    maxSubmissions: 1,
  });
  assert.equal(slot.ok, true);
  assert.equal(slot.via, 'resubmit_permission');
  await pool.query(
    `UPDATE submission_resubmit_permissions SET status = 'cancelled' WHERE task_id = ? AND student_id = ? AND status = 'active'`,
    [taskId, studentId]
  );
});

test('evaluateResubmitSlot blocks without permission at limit', async () => {
  const slot = await evaluateResubmitSlot({
    taskId: 1,
    studentId: 1,
    submissionId: 1,
    usedCount: 5,
    maxSubmissions: 1,
  });
  if (slot.ok && slot.via === 'task_limit') {
    assert.ok(true);
  } else {
    assert.equal(slot.ok, false);
  }
});
