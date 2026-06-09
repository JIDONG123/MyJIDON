/**
 * 学生端「个人实训成长档案」展示与本地筛选（不改后端）
 */

import {
  studentGradingStatusType,
  studentGradingStatusText,
  scoreTier,
  isReviewedStatus,
} from './studentSubmissionDisplay'

export function pickArchiveScore(row) {
  if (row?.final_score != null && row.final_score !== '') {
    const n = Number(row.final_score)
    return Number.isFinite(n) ? n : null
  }
  if (row?.total_score != null && row.total_score !== '') {
    const n = Number(row.total_score)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function formatArchiveScore(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toFixed(0)} 分`
}

export function archiveStatusMeta(gradeStatus) {
  const tagType = studentGradingStatusType(gradeStatus)
  let label = studentGradingStatusText(gradeStatus)
  if (label === '人工已复核') label = '教师已复核'
  return { label, tagType }
}

export function canViewResultReport(row) {
  if (!row?.submission_id) return false
  const s = row.grade_status
  if (!s || s === 'pending' || s === 'ai_grading') return false
  return true
}

function truncateText(text, max = 48) {
  const s = String(text || '').trim()
  if (!s) return ''
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

function weakPointTagText(item) {
  const label = String(item?.label || '').trim()
  const detail = String(item?.detail || '').trim()
  const generic = /^(AI\s*问题分析|智能核查(\s*\d+)?)$/i.test(label)
  if (!generic && label) return label
  return truncateText(detail, 28) || label || '待加强'
}

export function splitWeakPoints(weakPoints = []) {
  const tags = []
  const improvements = []
  for (const item of weakPoints) {
    const label = String(item?.label || '').trim()
    const detail = String(item?.detail || '').trim()
    if (/AI\s*问题分析/i.test(label)) {
      if (detail) improvements.push(detail)
    } else {
      tags.push({
        text: weakPointTagText(item),
        title: detail && detail !== weakPointTagText(item) ? detail : '',
      })
    }
  }
  return { tags, improvements }
}

export function computeArchiveSummary(rows = []) {
  const total = rows.length
  const reviewed = rows.filter((r) => isReviewedStatus(r.grade_status)).length
  const scores = rows.map(pickArchiveScore).filter((n) => n != null)

  const avgScore =
    scores.length > 0 ? (scores.reduce((s, n) => s + n, 0) / scores.length).toFixed(1) : '—'
  const maxScore = scores.length > 0 ? Math.max(...scores).toFixed(0) : '—'

  let weakPointCount = 0
  let needImproveCount = 0
  for (const row of rows) {
    weakPointCount += (row.weak_points || []).length
    const score = pickArchiveScore(row)
    if (score != null && score < 80) needImproveCount += 1
    else if ((row.weak_points || []).length > 0) needImproveCount += 1
  }

  return { total, reviewed, avgScore, maxScore, weakPointCount, needImproveCount }
}

export function matchesArchiveStatusFilter(row, filter) {
  if (!filter) return true
  const s = row.grade_status
  switch (filter) {
    case 'pending':
      return s == null || s === '' || s === 'pending' || s === 'ai_grading'
    case 'ai_graded':
      return s === 'ai_graded'
    case 'human_reviewed':
      return isReviewedStatus(s)
    default:
      return true
  }
}

export function matchesArchiveTierFilter(row, filter) {
  if (!filter) return true
  const score = pickArchiveScore(row)
  if (score == null) return false
  const tier = scoreTier(score)
  return tier.key === filter
}

export function filterArchiveRows(rows, { keyword, status, tier }) {
  const kw = (keyword || '').trim().toLowerCase()
  return rows.filter((row) => {
    if (!matchesArchiveStatusFilter(row, status)) return false
    if (!matchesArchiveTierFilter(row, tier)) return false
    if (kw) {
      const weakHay = (row.weak_points || [])
        .map((w) => `${w.label || ''} ${w.detail || ''}`)
        .join(' ')
      const hay = `${row.task_title || ''} ${row.human_comment || ''} ${row.ai_comment || ''} ${weakHay}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
}

export function enrichArchiveRow(row) {
  const score = pickArchiveScore(row)
  const tier = scoreTier(score)
  const statusMeta = archiveStatusMeta(row.grade_status)
  const { tags, improvements } = splitWeakPoints(row.weak_points || [])

  return {
    ...row,
    displayScore: score,
    scoreText: formatArchiveScore(score),
    scoreTier: tier,
    statusMeta,
    weakTags: tags,
    improvementTexts: improvements,
    canViewReport: canViewResultReport(row),
    humanComment: String(row.human_comment || '').trim(),
    aiComment: String(row.ai_comment || '').trim(),
    cardAccent: tier.tone !== 'muted' ? tier.tone : 'muted',
  }
}
