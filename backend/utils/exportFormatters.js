const DASH = '—';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * 统一 yyyy-mm-dd hh:mm:ss；无效/空 → —
 */
function formatDateTime(value) {
  if (value == null || value === '') return DASH;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return DASH;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  } catch {
    return DASH;
  }
}

/**
 * 保留 2 位小数；空/无效 → —
 */
function formatScore(value) {
  if (value == null || value === '') return DASH;
  const n = Number(value);
  if (!Number.isFinite(n)) return DASH;
  return n.toFixed(2);
}

function emptyDash(value) {
  if (value == null || value === '') return DASH;
  if (typeof value === 'string' && value.trim() === '') return DASH;
  return String(value);
}

/**
 * @param {string|null|undefined} status grading_results.status
 * @param {boolean} [hasSubmission=true]
 */
function gradingStatusLabel(status, hasSubmission = true) {
  if (!hasSubmission) return '未提交';
  if (status == null || status === '' || status === 'pending') return '待批改';
  const map = {
    ai_grading: 'AI批改中',
    ai_graded: 'AI已批改',
    human_graded: '人工已复核',
    ai_failed: 'AI批改失败',
    cancelled: '已取消',
  };
  return map[status] || '未知状态';
}

function safeFileName(name) {
  return String(name ?? '')
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function similarityLevelLabel(level) {
  const map = {
    none: '无',
    low: '低',
    warn: '预警',
    high: '疑似抄袭',
  };
  if (level == null || level === '') return DASH;
  return map[level] || emptyDash(level);
}

function formatSimilarityPercent(value) {
  if (value == null || value === '') return DASH;
  const n = Number(value);
  if (!Number.isFinite(n)) return DASH;
  return `${n.toFixed(1)}%`;
}

function isLateSubmit(submittedAt, deadline) {
  if (!submittedAt || !deadline) return false;
  try {
    return new Date(submittedAt).getTime() > new Date(deadline).getTime();
  } catch {
    return false;
  }
}

/** Excel 单元格：有效 Date 或 — 字符串 */
function toExcelDate(value) {
  if (value == null || value === '') return DASH;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return DASH;
    return d;
  } catch {
    return DASH;
  }
}

/** Excel 单元格：有效 number 或 — 字符串 */
function toExcelScore(value) {
  if (value == null || value === '') return DASH;
  const n = Number(value);
  if (!Number.isFinite(n)) return DASH;
  return n;
}

module.exports = {
  DASH,
  formatDateTime,
  formatScore,
  emptyDash,
  gradingStatusLabel,
  safeFileName,
  similarityLevelLabel,
  formatSimilarityPercent,
  isLateSubmit,
  toExcelDate,
  toExcelScore,
};
