const pool = require('../config/database');
const { decryptScoreBundle } = require('./qbScoreCrypto');

function parseJson(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

/** 未到公布时间则不解密落库 */
function publishAllowsUnseal(publishScoresAt) {
  if (!publishScoresAt) return true;
  return new Date(publishScoresAt) <= new Date();
}

/**
 * 成绩已公布（或未设置公布时间）且存在密文时，解密写回明文并清空密文列。
 * @returns {Promise<boolean>} 是否执行了 UPDATE
 */
async function persistUnsealExamAttemptIfReady(attemptId, publishScoresAt) {
  if (!publishAllowsUnseal(publishScoresAt)) return false;
  const [rows] = await pool.query(
    `SELECT id, score_bundle_cipher FROM qb_exam_attempts WHERE id = ? AND score_bundle_cipher IS NOT NULL`,
    [attemptId]
  );
  if (!rows.length) return false;
  const b = decryptScoreBundle(rows[0].score_bundle_cipher);
  if (!b) return false;
  await pool.query(
    `UPDATE qb_exam_attempts SET objective_score = ?, subjective_score = ?, total_score = ?, per_question_scores = ?, score_bundle_cipher = NULL WHERE id = ?`,
    [
      b.objective_score,
      b.subjective_score,
      b.total_score,
      JSON.stringify(b.per_question_scores != null ? b.per_question_scores : {}),
      attemptId,
    ]
  );
  return true;
}

async function persistUnsealPracticeAttemptIfReady(attemptId, publishScoresAt) {
  if (!publishAllowsUnseal(publishScoresAt)) return false;
  const [rows] = await pool.query(
    `SELECT id, score_bundle_cipher FROM qb_practice_attempts WHERE id = ? AND score_bundle_cipher IS NOT NULL`,
    [attemptId]
  );
  if (!rows.length) return false;
  const b = decryptScoreBundle(rows[0].score_bundle_cipher);
  if (!b) return false;
  await pool.query(
    `UPDATE qb_practice_attempts SET objective_score = ?, subjective_score = ?, total_score = ?, per_question_scores = ?, score_bundle_cipher = NULL WHERE id = ?`,
    [
      b.objective_score,
      b.subjective_score,
      b.total_score,
      JSON.stringify(b.per_question_scores != null ? b.per_question_scores : {}),
      attemptId,
    ]
  );
  return true;
}

module.exports = {
  persistUnsealExamAttemptIfReady,
  persistUnsealPracticeAttemptIfReady,
};
