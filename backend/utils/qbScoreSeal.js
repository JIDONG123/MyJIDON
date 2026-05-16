const pool = require('../config/database');
const { encryptScoreBundle, shouldSealScores } = require('./qbScoreCrypto');

function parseJson(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

/**
 * 考试：仅当已阅卷且设置了未来公布时间时，将分项与总分写入密文并清空明文字段（排名 rank_in_class 仍保留明文）
 */
async function sealExamAttemptIfNeeded(attemptId) {
  const [rows] = await pool.query(
    `SELECT a.id, a.status, a.objective_score, a.subjective_score, a.total_score, a.per_question_scores, e.publish_scores_at
     FROM qb_exam_attempts a
     JOIN qb_exams e ON e.id = a.exam_id
     WHERE a.id = ?`,
    [attemptId]
  );
  if (!rows.length) return;
  const r = rows[0];
  if (r.status !== 'graded') return;
  if (!shouldSealScores(r.publish_scores_at)) return;
  const bundle = {
    objective_score: r.objective_score,
    subjective_score: r.subjective_score,
    total_score: r.total_score,
    per_question_scores: parseJson(r.per_question_scores),
  };
  const cipher = encryptScoreBundle(bundle);
  await pool.query(
    `UPDATE qb_exam_attempts SET score_bundle_cipher = ?, objective_score = NULL, subjective_score = NULL, total_score = NULL, per_question_scores = NULL WHERE id = ?`,
    [cipher, attemptId]
  );
}

/**
 * 练习：同上（依赖 qb_practices.publish_scores_at）
 */
async function sealPracticeAttemptIfNeeded(attemptId) {
  const [rows] = await pool.query(
    `SELECT a.id, a.status, a.objective_score, a.subjective_score, a.total_score, a.per_question_scores, p.publish_scores_at
     FROM qb_practice_attempts a
     JOIN qb_practices p ON p.id = a.practice_id
     WHERE a.id = ?`,
    [attemptId]
  );
  if (!rows.length) return;
  const r = rows[0];
  if (r.status !== 'graded') return;
  if (!shouldSealScores(r.publish_scores_at)) return;
  const bundle = {
    objective_score: r.objective_score,
    subjective_score: r.subjective_score,
    total_score: r.total_score,
    per_question_scores: parseJson(r.per_question_scores),
  };
  const cipher = encryptScoreBundle(bundle);
  await pool.query(
    `UPDATE qb_practice_attempts SET score_bundle_cipher = ?, objective_score = NULL, subjective_score = NULL, total_score = NULL, per_question_scores = NULL WHERE id = ?`,
    [cipher, attemptId]
  );
}

module.exports = {
  sealExamAttemptIfNeeded,
  sealPracticeAttemptIfNeeded,
};
