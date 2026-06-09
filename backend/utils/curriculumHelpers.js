function parseId(v) {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function trimOrNull(v, maxLen) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return maxLen ? s.slice(0, maxLen) : s;
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(query.pageSize || 20), 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function normalizeEvaluationMetrics(raw) {
  if (raw == null || raw === '') return null;
  let arr = raw;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return JSON.stringify(
    arr.map((x) => ({
      name: String(x.name || '').trim() || '指标',
      weight: Number(x.weight) || 0,
      maxScore: Number(x.maxScore != null ? x.maxScore : x.weight) || 0,
    }))
  );
}

module.exports = {
  parseId,
  trimOrNull,
  parsePagination,
  normalizeEvaluationMetrics,
};
