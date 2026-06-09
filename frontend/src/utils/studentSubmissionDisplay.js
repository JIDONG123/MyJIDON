/**
 * 学生端「我的提交」展示与本地筛选（不改共享 gradingStatusDisplay 行为）
 */

export function studentGradingStatusType(status) {
  if (status == null || status === '' || status === 'pending') return 'info'
  const types = {
    ai_grading: 'warning',
    ai_failed: 'danger',
    ai_graded: 'primary',
    human_graded: 'success',
    human_reviewed: 'success',
    completed: 'success',
  }
  return types[status] || 'info'
}

export function studentGradingStatusText(status) {
  if (status == null || status === '') return '待批改'
  const texts = {
    pending: '待批改',
    ai_grading: 'AI批改中',
    ai_failed: 'AI批改失败',
    ai_graded: 'AI已批改',
    human_graded: '人工已复核',
    human_reviewed: '人工已复核',
    completed: '人工已复核',
  }
  return texts[status] || String(status)
}

export function formatSubmissionScore(value) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(2)
}

/** 最终评分：优先教师分，否则 AI 分 */
export function pickFinalScore(row) {
  if (row?.human_score != null && row.human_score !== '') {
    const n = Number(row.human_score)
    return Number.isFinite(n) ? n : null
  }
  if (row?.total_score != null && row.total_score !== '') {
    const n = Number(row.total_score)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function scoreTier(score) {
  if (score == null || !Number.isFinite(score)) return { key: 'none', label: '', tone: 'muted' }
  if (score >= 90) return { key: 'excellent', label: '优秀', tone: 'excellent' }
  if (score >= 80) return { key: 'good', label: '良好', tone: 'good' }
  if (score >= 60) return { key: 'fair', label: '待提升', tone: 'fair' }
  return { key: 'poor', label: '需改进', tone: 'poor' }
}

const REVIEWED = new Set(['human_graded', 'human_reviewed', 'completed'])

export function isReviewedStatus(status) {
  return REVIEWED.has(status)
}

export function computeSubmissionSummary(rows = []) {
  const total = rows.length
  const reviewed = rows.filter((r) => isReviewedStatus(r.status)).length
  const aiGraded = rows.filter((r) => r.status === 'ai_graded').length
  const revised = rows.filter((r) => r.is_revised).length

  const finals = rows.map(pickFinalScore).filter((n) => n != null)
  const avgFinal =
    finals.length > 0 ? (finals.reduce((s, n) => s + n, 0) / finals.length).toFixed(2) : '—'

  return { total, reviewed, aiGraded, revised, avgFinal }
}

export function matchesStatusFilter(row, filter) {
  if (!filter) return true
  const s = row.status
  switch (filter) {
    case 'pending':
      return s == null || s === '' || s === 'pending'
    case 'ai_graded':
      return s === 'ai_graded'
    case 'human_reviewed':
      return isReviewedStatus(s)
    case 'ai_failed':
      return s === 'ai_failed'
    default:
      return true
  }
}

export function matchesRevisedFilter(row, filter) {
  if (!filter) return true
  if (filter === 'revised') return Boolean(row.is_revised)
  if (filter === 'not_revised') return !row.is_revised
  return true
}

export function matchesScoreFilter(row, filter) {
  if (!filter) return true
  const score = pickFinalScore(row)
  if (score == null) return false
  if (filter === 'high') return score >= 90
  if (filter === 'low') return score < 60
  return true
}

export function filterSubmissions(rows, { keyword, status, revised, scoreBand }) {
  const kw = (keyword || '').trim().toLowerCase()
  return rows.filter((row) => {
    if (!matchesStatusFilter(row, status)) return false
    if (!matchesRevisedFilter(row, revised)) return false
    if (!matchesScoreFilter(row, scoreBand)) return false
    if (kw) {
      const hay = `${row.title || ''} ${row.file_name || ''}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
}
