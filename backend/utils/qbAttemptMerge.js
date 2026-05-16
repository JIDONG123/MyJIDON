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

/**
 * 将密文成绩合并回行对象（教师端/导出/解密后展示）
 */
function mergeAttemptScores(row) {
  if (!row || !row.score_bundle_cipher) return row;
  const b = decryptScoreBundle(row.score_bundle_cipher);
  if (!b) return row;
  return {
    ...row,
    objective_score: b.objective_score ?? row.objective_score,
    subjective_score: b.subjective_score ?? row.subjective_score,
    total_score: b.total_score ?? row.total_score,
    per_question_scores: b.per_question_scores != null ? b.per_question_scores : row.per_question_scores,
  };
}

function mergeJsonPer(row) {
  const merged = mergeAttemptScores(row);
  return parseJson(merged.per_question_scores);
}

module.exports = {
  mergeAttemptScores,
  mergeJsonPer,
  parseJson,
};
