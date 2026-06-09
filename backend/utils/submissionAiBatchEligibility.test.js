/**
 * node --test utils/submissionAiBatchEligibility.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateSubmissionRowEligibility, assertNewAiGradeAllowed } = require('./submissionAiBatchEligibility');

function row(overrides = {}) {
  return {
    id: 1,
    task_id: 10,
    student_id: 100,
    safety_status: 'passed',
    grading_status: 'pending',
    active_item_status: null,
    code_run_summary: '通过',
    ...overrides,
  };
}

test('pending submission without active job is eligible at row level', () => {
  const verdict = evaluateSubmissionRowEligibility(row(), true);
  assert.equal(verdict.eligible, true);
  assert.equal(verdict.reasonCode, 'eligible');
});

test('ai_graded is teacher_review_pending', () => {
  const verdict = evaluateSubmissionRowEligibility(row({ grading_status: 'ai_graded' }));
  assert.equal(verdict.eligible, false);
  assert.equal(verdict.reasonCode, 'teacher_review_pending');
});

test('human_graded is teacher_reviewed', () => {
  const verdict = evaluateSubmissionRowEligibility(row({ grading_status: 'human_graded' }));
  assert.equal(verdict.eligible, false);
  assert.equal(verdict.reasonCode, 'teacher_reviewed');
});

test('ai_grading is not eligible', () => {
  const verdict = evaluateSubmissionRowEligibility(row({ grading_status: 'ai_grading', active_item_status: 'running' }));
  assert.equal(verdict.eligible, false);
  assert.equal(verdict.reasonCode, 'ai_running');
});

test('orphan ai_grading without active item is eligible', () => {
  const verdict = evaluateSubmissionRowEligibility(row({ grading_status: 'ai_grading', active_item_status: null }));
  assert.equal(verdict.eligible, true);
});

test('queued item blocks selection with ai_queued', () => {
  const verdict = evaluateSubmissionRowEligibility(row({ active_item_status: 'queued' }));
  assert.equal(verdict.eligible, false);
  assert.equal(verdict.reasonCode, 'ai_queued');
});

test('pending_review safety blocks selection', () => {
  const verdict = evaluateSubmissionRowEligibility(row({ safety_status: 'pending_review' }));
  assert.equal(verdict.eligible, false);
  assert.equal(verdict.reasonCode, 'safety_review_required');
});

test('ai_failed remains eligible at row level', () => {
  const verdict = evaluateSubmissionRowEligibility(row({ grading_status: 'ai_failed' }));
  assert.equal(verdict.eligible, true);
});

test('missing row is not_submitted', () => {
  const verdict = evaluateSubmissionRowEligibility(null);
  assert.equal(verdict.eligible, false);
  assert.equal(verdict.reasonCode, 'not_submitted');
});

test('code run summary empty blocks when enabled', () => {
  const verdict = evaluateSubmissionRowEligibility(row({ code_run_summary: '' }), true);
  assert.equal(verdict.eligible, false);
  assert.equal(verdict.reasonCode, 'code_run_required');
});

test('assertNewAiGradeAllowed blocks ai_graded without forceRegrade', () => {
  assert.throws(
    () => assertNewAiGradeAllowed({ gradingStatus: 'ai_graded', activeItemStatus: null, forceRegrade: false }),
    (e) => e.status === 400 && e.reasonCode === 'ai_completed'
  );
});

test('assertNewAiGradeAllowed blocks human_graded without forceRegrade', () => {
  assert.throws(
    () => assertNewAiGradeAllowed({ gradingStatus: 'human_graded', activeItemStatus: null, forceRegrade: false }),
    (e) => e.status === 400 && e.reasonCode === 'teacher_reviewed'
  );
});

test('assertNewAiGradeAllowed blocks active queued item with 409', () => {
  assert.throws(
    () => assertNewAiGradeAllowed({ gradingStatus: 'pending', activeItemStatus: 'queued', forceRegrade: false }),
    (e) => e.status === 409 && e.reasonCode === 'ai_queued'
  );
});

test('assertNewAiGradeAllowed allows regrade when forceRegrade', () => {
  assert.doesNotThrow(() =>
    assertNewAiGradeAllowed({ gradingStatus: 'ai_graded', activeItemStatus: null, forceRegrade: true })
  );
});
