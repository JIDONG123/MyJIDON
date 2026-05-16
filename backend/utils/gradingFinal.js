/**
 * 综合分：AI 与教师人工（沿用任务或系统权重）
 * 校企双轨：校内综合分与企业导师分按任务 campus_grade_weight / enterprise_grade_weight（合计 100%）加权为 final_score
 */

function mergeWeights(taskRow, systemWeights) {
  const taw = taskRow?.score_ai_weight;
  const thw = taskRow?.score_human_weight;
  if (taw != null && thw != null && taw !== '' && thw !== '') {
    const a = Number(taw);
    const h = Number(thw);
    if (!Number.isNaN(a) && !Number.isNaN(h)) {
      return { score_ai_weight: a, score_human_weight: h };
    }
  }
  return systemWeights;
}

function computeFinalScore(aiScore, humanScore, weights) {
  const aw = Number(weights.score_ai_weight) || 0.4;
  const hw = Number(weights.score_human_weight) || 0.6;
  const a = Number(aiScore);
  const h = humanScore === null || humanScore === undefined || humanScore === '' ? null : Number(humanScore);
  if (h === null || Number.isNaN(h)) {
    return Number.isFinite(a) ? parseFloat(a.toFixed(2)) : null;
  }
  const denom = aw + hw || 1;
  const v = (a * aw + h * hw) / denom;
  return parseFloat(v.toFixed(2));
}

/** 企业导师已打分时，与校内综合分按权重合并；否则 final 等于校内综合分 */
function computeDualTrackFinal(campusComposite, enterpriseScore, campusGradeWeight, enterpriseGradeWeight) {
  const cc = Number(campusComposite);
  const esVal = enterpriseScore;
  const es =
    esVal === null || esVal === undefined || esVal === '' || (typeof esVal === 'string' && esVal.trim() === '')
      ? null
      : Number(esVal);
  if (es == null || Number.isNaN(es)) {
    return Number.isFinite(cc) ? parseFloat(cc.toFixed(2)) : null;
  }
  let c = Number(campusGradeWeight);
  let e = Number(enterpriseGradeWeight);
  if (Number.isNaN(c)) c = 50;
  if (Number.isNaN(e)) e = 50;
  const sum = c + e;
  if (sum <= 0) {
    return Number.isFinite(cc) ? parseFloat(cc.toFixed(2)) : parseFloat(Number(es).toFixed(2));
  }
  const campusPart = Number.isFinite(cc) ? cc : 0;
  const v = (c / sum) * campusPart + (e / sum) * es;
  return parseFloat(v.toFixed(2));
}

/**
 * @param {object} row grading_results 行 + tasks 上的权重字段（camel 或 snake 均可由调用方展平）
 */
function buildFinalFromGradingRow(row, systemWeights) {
  const weights = mergeWeights(row, systemWeights);
  const ai = row.total_score;
  const human = row.human_score;
  const campus = computeFinalScore(ai, human, weights);
  return computeDualTrackFinal(campus, row.enterprise_score, row.campus_grade_weight, row.enterprise_grade_weight);
}

module.exports = {
  mergeWeights,
  computeFinalScore,
  computeDualTrackFinal,
  buildFinalFromGradingRow,
};
