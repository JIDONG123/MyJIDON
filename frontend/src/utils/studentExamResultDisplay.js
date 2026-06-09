import { qbTypeLabel } from './qbLabels'
import { practiceScoreTier } from './studentQbPracticeDisplay'

const TYPE_ORDER = ['single', 'multi', 'judge', 'fill', 'short', 'code']

export function formatExamResultScore(value, digits = 2) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

export function computeExamMaxTotal(examResult) {
  const byType = examResult?.scores_by_type || []
  if (byType.length) {
    return byType.reduce((s, row) => s + (Number(row.max) || 0), 0)
  }
  const breakdown = examResult?.breakdown || []
  if (breakdown.length) {
    return breakdown.reduce((s, row) => s + (Number(row.max) || 0), 0)
  }
  return 0
}

export function formatExamScoreWithMax(value, maxTotal) {
  const scoreText = formatExamResultScore(value)
  if (scoreText === '—') return '—'
  const max = Number(maxTotal)
  if (Number.isFinite(max) && max > 0) return `${scoreText} / ${max.toFixed(2)} 分`
  return `${scoreText} 分`
}

export function formatRankLabel(rank) {
  if (rank == null || rank === '') return '—'
  const n = Number(rank)
  return Number.isFinite(n) ? `第 ${n} 名` : '—'
}

export function resolveExamScoreTier(totalScore, maxTotal) {
  if (maxTotal === 100) {
    return practiceScoreTier(totalScore, 100)
  }
  return null
}

export function deriveBreakdownScoreStatus(earned, max, pending) {
  if (pending) {
    return { key: 'pending', label: '待批改', tagType: 'info' }
  }
  const e = earned != null && Number.isFinite(Number(earned)) ? Number(earned) : 0
  const m = Number(max) || 0
  if (m > 0 && e >= m) {
    return { key: 'full', label: '满分', tagType: 'success' }
  }
  if (e > 0) {
    return { key: 'partial', label: '部分得分', tagType: 'warning' }
  }
  return { key: 'zero', label: '未得分', tagType: 'danger' }
}

export function enrichTypeScoreRows(scoresByType = []) {
  const map = {}
  for (const row of scoresByType) {
    const type = row.type || 'unknown'
    map[type] = row
  }
  const ordered = TYPE_ORDER.filter((t) => map[t]).concat(
    Object.keys(map).filter((t) => !TYPE_ORDER.includes(t))
  )
  return ordered.map((type) => {
    const row = map[type]
    const earned = Number(row.earned) || 0
    const max = Number(row.max) || 0
    const count = Number(row.count) || 0
    const rate = max > 0 ? Math.min(100, Math.round((earned / max) * 100)) : 0
    return {
      type,
      typeLabel: qbTypeLabel(type),
      count,
      earned,
      max,
      rate,
      scoreText: `${formatExamResultScore(earned)} / ${formatExamResultScore(max)}`,
    }
  })
}

export function enrichBreakdownRows(breakdown = []) {
  return breakdown.map((row) => {
    const earned = row.earned != null && Number.isFinite(Number(row.earned)) ? Number(row.earned) : null
    const max = Number(row.max) || 0
    const pending = !!row.pending
    const scoreStatus = deriveBreakdownScoreStatus(earned, max, pending)
    const stem = String(row.stem_short || '').trim()
    return {
      ...row,
      typeLabel: qbTypeLabel(row.type),
      stemDisplay: stem || '—',
      earnedDisplay: pending && earned == null ? '—' : formatExamResultScore(earned ?? 0),
      maxDisplay: formatExamResultScore(max),
      scoreLine: pending && earned == null ? '—' : `${formatExamResultScore(earned ?? 0)} / ${formatExamResultScore(max)}`,
      scoreStatus,
    }
  })
}

export function examResultInsight(totalScore, maxTotal) {
  const total = Number(totalScore)
  const max = Number(maxTotal)
  const baseText =
    '本场考试已结束，成绩结果以教师发布后的数据为准。你可以查看题型得分和题目明细，了解各类题目的得分情况。'

  if (!Number.isFinite(total) || max <= 0) {
    return { tone: 'info', title: '正式成绩单', text: baseText }
  }

  const rate = total / max
  if (rate < 0.6) {
    return {
      tone: 'warning',
      title: '正式成绩单',
      text: `${baseText} 本场考试得分偏低，建议结合题型得分情况，重点复习低得分题型。`,
    }
  }

  return { tone: 'info', title: '正式成绩单', text: baseText }
}
