/**
 * 客观题自动判分（与题型 answer_json 约定一致）
 * answer_json 约定：
 *  - single: { "correct": "A" }
 *  - multi:  { "correct": ["A","C"] } （顺序无关）
 *  - judge:  { "correct": true } 或 { "correct": false }
 *  - fill:   { "correct": "文本", "ignoreCase": true } 或 { "alternatives": ["a","b"] }
 *  - short/code: 不参与客观自动分，返回 auto=false
 */

function normStr(s) {
  return String(s == null ? '' : s).trim();
}

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
 * @param {{ type: string, answer_json: any, default_score?: number }} q
 * @param {unknown} studentAnswer 学生答案（字符串/数组/布尔）
 * @param {number} maxScore 本题满分
 * @returns {{ earned: number, max: number, auto: boolean }}
 */
function scoreObjective(q, studentAnswer, maxScore) {
  const max = Number(maxScore);
  const cap = Number.isFinite(max) && max > 0 ? max : 0;
  const aj = parseJson(q.answer_json) || {};
  const type = q.type;

  if (type === 'short' || type === 'code') {
    return { earned: 0, max: cap, auto: false };
  }

  if (type === 'single') {
    const c = normStr(aj.correct).toUpperCase();
    const a = normStr(studentAnswer).toUpperCase();
    return { earned: c && a && c === a ? cap : 0, max: cap, auto: true };
  }

  if (type === 'multi') {
    const correct = Array.isArray(aj.correct) ? aj.correct.map((x) => normStr(x).toUpperCase()).filter(Boolean) : [];
    const arr = Array.isArray(studentAnswer)
      ? studentAnswer.map((x) => normStr(x).toUpperCase()).filter(Boolean)
      : normStr(studentAnswer)
          .split(/[,;，；\s]+/)
          .map((x) => x.toUpperCase())
          .filter(Boolean);
    if (!correct.length) return { earned: 0, max: cap, auto: true };
    if (arr.length !== correct.length) return { earned: 0, max: cap, auto: true };
    const setC = new Set(correct);
    for (const x of arr) {
      if (!setC.has(x)) return { earned: 0, max: cap, auto: true };
    }
    return { earned: cap, max: cap, auto: true };
  }

  if (type === 'judge') {
    let truth = aj.correct;
    if (typeof truth === 'string') {
      const t = normStr(truth).toLowerCase();
      if (t === '对' || t === 'true' || t === '1' || t === 'yes') truth = true;
      else if (t === '错' || t === 'false' || t === '0' || t === 'no') truth = false;
    }
    let sa = studentAnswer;
    if (typeof sa === 'string') {
      const t = normStr(sa).toLowerCase();
      if (t === '对' || t === 'true' || t === '1' || t === 'yes') sa = true;
      if (t === '错' || t === 'false' || t === '0' || t === 'no') sa = false;
    }
    return { earned: sa === truth ? cap : 0, max: cap, auto: true };
  }

  if (type === 'fill') {
    const ignore = !!aj.ignoreCase;
    const norm = (x) => (ignore ? normStr(x).toLowerCase() : normStr(x));
    const pool = [];
    if (aj.correct != null) pool.push(norm(aj.correct));
    if (Array.isArray(aj.alternatives)) {
      aj.alternatives.forEach((x) => pool.push(norm(x)));
    }
    const ans = norm(studentAnswer);
    if (!pool.length || !ans) return { earned: 0, max: cap, auto: true };
    const ok = pool.some((p) => p === ans);
    return { earned: ok ? cap : 0, max: cap, auto: true };
  }

  return { earned: 0, max: cap, auto: true };
}

module.exports = { scoreObjective, parseJson };
