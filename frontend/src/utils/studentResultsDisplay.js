import {
  studentGradingStatusType,
  studentGradingStatusText,
  scoreTier,
  isReviewedStatus,
} from './studentSubmissionDisplay'

export { studentGradingStatusType, studentGradingStatusText, scoreTier }

/** 综合分：与页面原有 pickScore 逻辑一致 */
export function pickCompositeScore(row) {
  const v = row?.displayScore ?? row?.final_score ?? row?.total_score
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function formatGradeScore(value, digits = 1) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

export function computeResultsSummary(rows = []) {
  const scores = rows.map(pickCompositeScore).filter((n) => n != null)
  const completed = rows.length
  const avg =
    scores.length > 0 ? (scores.reduce((s, n) => s + n, 0) / scores.length).toFixed(1) : '—'
  const max = scores.length > 0 ? Math.max(...scores).toFixed(1) : '—'
  const min = scores.length > 0 ? Math.min(...scores).toFixed(1) : '—'
  const excellent = scores.filter((n) => n >= 90).length
  const needImprove = scores.filter((n) => n < 60).length

  return { completed, avg, max, min, excellent, needImprove, avgNum: scores.length ? Number(avg) : null }
}

export function analysisInsight(avgNum) {
  if (avgNum == null || !Number.isFinite(avgNum)) {
    return {
      tone: 'info',
      title: '暂无足够成绩数据',
      text: '完成实训并通过批改后，系统将在此给出学习表现分析与改进建议。',
    }
  }
  if (avgNum >= 90) {
    return {
      tone: 'success',
      title: '整体表现优秀',
      text: '整体表现优秀，请继续保持。',
    }
  }
  if (avgNum >= 80) {
    return {
      tone: 'primary',
      title: '整体表现良好',
      text: '整体表现良好，建议关注个别薄弱任务。',
    }
  }
  if (avgNum >= 60) {
    return {
      tone: 'warning',
      title: '仍有提升空间',
      text: '基础完成情况尚可，建议查看低分任务报告，重点提升代码规范和功能完整性。',
    }
  }
  return {
    tone: 'danger',
    title: '需要重点改进',
    text: '当前成绩偏低，建议优先查看评价报告中的问题分析和改进建议。',
  }
}

export function matchesResultsStatusFilter(row, filter) {
  if (!filter) return true
  const s = row.status
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

export function matchesTierFilter(row, tierKey) {
  if (!tierKey) return true
  const score = pickCompositeScore(row)
  if (score == null) return false
  const tier = scoreTier(score)
  return tier.key === tierKey
}

export function filterResultsRows(rows, { keyword, status, tier }) {
  const kw = (keyword || '').trim().toLowerCase()
  return rows.filter((row) => {
    if (!matchesResultsStatusFilter(row, status)) return false
    if (!matchesTierFilter(row, tier)) return false
    if (kw && !(row.title || '').toLowerCase().includes(kw)) return false
    return true
  })
}

export function sortResultsRows(rows, sortBy) {
  const list = [...rows]
  if (sortBy === 'score') {
    list.sort((a, b) => (pickCompositeScore(b) ?? -1) - (pickCompositeScore(a) ?? -1))
  } else {
    list.sort((a, b) => {
      const ta = a.submitted_at ? new Date(a.submitted_at).getTime() : 0
      const tb = b.submitted_at ? new Date(b.submitted_at).getTime() : 0
      return tb - ta
    })
  }
  return list
}

export function lowScoreTasks(rows, threshold = 60) {
  return rows
    .filter((r) => {
      const s = pickCompositeScore(r)
      return s != null && s < threshold
    })
    .slice(0, 5)
}
