const { tryParseJsonObject } = require('./gradingNormalize');

function clampScore(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function toStringArray(val) {
  if (val == null) return [];
  if (Array.isArray(val)) {
    return val.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof val === 'string' && val.trim()) {
    return val
      .split(/\n+/)
      .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeAiReviewJson(obj) {
  if (!obj || typeof obj !== 'object') {
    return {
      styleScore: 0,
      strengths: [],
      issues: [],
      suggestions: [],
      knowledgeTips: [],
    };
  }
  return {
    styleScore: clampScore(obj.styleScore ?? obj.style_score),
    strengths: toStringArray(obj.strengths),
    issues: toStringArray(obj.issues),
    suggestions: toStringArray(obj.suggestions),
    knowledgeTips: toStringArray(obj.knowledgeTips ?? obj.knowledge_tips),
  };
}

function parseAiReviewFromLlmText(text) {
  const obj = tryParseJsonObject(text);
  if (!obj) return null;
  return normalizeAiReviewJson(obj);
}

module.exports = {
  normalizeAiReviewJson,
  parseAiReviewFromLlmText,
  clampScore,
};
