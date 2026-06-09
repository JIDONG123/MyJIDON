/**
 * node --test utils/gradingLegacyContract.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertLegacyAiGradeData,
  assertLegacyBatchGradeData,
  assertLegacyBatchProgressData,
  buildLegacyAiResponse,
  buildLegacyBatchResponse,
} = require('./gradingLegacyContract');

test('legacy ai grade data shape', () => {
  const body = buildLegacyAiResponse({
    submissionId: 11,
    status: 'ai_grading',
    jobId: 1,
    deduped: false,
  });
  assert.equal(body.success, true);
  assert.deepEqual(assertLegacyAiGradeData(body.data), []);
  assert.equal(body.data.async, true);
  assert.equal(body.data.status, 'ai_grading');
});

test('legacy batch grade data shape with queue', () => {
  const body = buildLegacyBatchResponse(
    { taskId: 7, queued: 3, batchId: 12345, jobId: 2, deduped: false },
    7
  );
  assert.deepEqual(assertLegacyBatchGradeData(body.data), []);
  assert.equal(body.data.queued, 3);
  assert.equal(String(body.data.batchId), '12345');
});

test('legacy batch progress minimal shape', () => {
  const data = {
    taskId: 7,
    batchId: '999',
    total: 5,
    grading: 2,
    failed: 0,
    done: 3,
  };
  assert.deepEqual(assertLegacyBatchProgressData(data), []);
});

test('legacy batch progress rejects unknown fields', () => {
  const errs = assertLegacyBatchProgressData({
    taskId: 1,
    batchId: '1',
    total: 1,
    grading: 0,
    failed: 0,
    done: 1,
    unexpected: true,
  });
  assert.ok(errs.some((e) => e.includes('unexpected')));
});
