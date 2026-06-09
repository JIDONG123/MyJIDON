import { qbTypeLabel, parseJsonLoose } from './qbLabels'
import { practiceScoreTier } from './studentQbPracticeDisplay'

const SUBJECTIVE_TYPES = new Set(['short', 'code'])

const TYPE_ORDER = ['judge', 'single', 'multi', 'fill', 'short', 'code']

export function stemPreview(stem, maxLen = 120) {
  const t = String(stem || '').replace(/\s+/g, ' ').trim()
  if (!t) return '—'
  return t.length <= maxLen ? t : `${t.slice(0, maxLen)}…`
}

export function computePracticeMaxTotal(questions = []) {
  return questions.reduce((sum, q) => sum + (Number(q.max_score) || 0), 0)
}

export function formatResultScore(value, digits = 2) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

export function formatScoreWithMax(value, maxTotal) {
  const scoreText = formatResultScore(value)
  if (scoreText === '—') return '—'
  const max = Number(maxTotal)
  if (Number.isFinite(max) && max > 0) return `${scoreText} / ${max.toFixed(2)} 分`
  return `${scoreText} 分`
}

export function deriveQuestionScoreStatus(earned, max, pending) {
  if (pending) {
    return { key: 'pending', label: '待批改', tagType: 'info' }
  }
  const e = earned != null && Number.isFinite(Number(earned)) ? Number(earned) : 0
  const m = Number(max) || 0
  if (m > 0 && e >= m) {
    return { key: 'full', label: '得分', tagType: 'success' }
  }
  if (e > 0) {
    return { key: 'partial', label: '部分得分', tagType: 'warning' }
  }
  return { key: 'zero', label: '未得分', tagType: 'danger' }
}

export function formatStudentAnswer(raw, type) {
  if (raw == null || raw === '') return ''
  if (Array.isArray(raw)) return raw.map(String).join('、')
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw)
    } catch {
      return String(raw)
    }
  }
  const s = String(raw).trim()
  if (!s) return ''
  if (type === 'code') return s.length > 200 ? `${s.slice(0, 200)}…` : s
  return s.length > 160 ? `${s.slice(0, 160)}…` : s
}

export function buildPracticeQuestionRows(questions = [], attempt = null) {
  const per = parseJsonLoose(attempt?.per_question_scores) || {}
  const answers = parseJsonLoose(attempt?.answers_json) || {}

  return questions.map((q, idx) => {
    const cell = per[String(q.pq_id)] || {}
    const max = Number(q.max_score) || Number(cell.max) || 0
    const pending = !!cell.pending
    const earnedRaw = cell.earned
    const earned =
      earnedRaw != null && Number.isFinite(Number(earnedRaw)) ? Number(earnedRaw) : null
    const scoreStatus = deriveQuestionScoreStatus(earned, max, pending)
    const studentAnswer = formatStudentAnswer(answers[String(q.pq_id)], q.type)
    const teacherComment = cell.comment || cell.ai_rationale || cell.feedback || ''

    return {
      index: idx + 1,
      pq_id: q.pq_id,
      type: q.type,
      typeLabel: qbTypeLabel(q.type),
      stemPreview: stemPreview(q.stem),
      max,
      earned,
      pending,
      scoreStatus,
      scoreLine:
        pending && earned == null
          ? '—'
          : `${(earned ?? 0).toFixed(2)} / ${max.toFixed(2)}`,
      isSubjective: SUBJECTIVE_TYPES.has(q.type),
      studentAnswer,
      teacherComment: teacherComment ? String(teacherComment).trim() : '',
    }
  })
}

export function aggregateTypeScores(questionRows = []) {
  const byType = {}
  for (const row of questionRows) {
    const t = row.type || 'unknown'
    if (!byType[t]) {
      byType[t] = { type: t, typeLabel: qbTypeLabel(t), earned: 0, max: 0, count: 0 }
    }
    byType[t].max += row.max
    byType[t].count += 1
    if (row.earned != null && Number.isFinite(row.earned)) {
      byType[t].earned += row.earned
    }
  }

  return TYPE_ORDER.filter((t) => byType[t]?.max > 0)
    .concat(Object.keys(byType).filter((t) => !TYPE_ORDER.includes(t)))
    .map((t) => byType[t])
    .filter(Boolean)
    .map((item) => ({
      ...item,
      rate: item.max > 0 ? Math.min(100, Math.round((item.earned / item.max) * 100)) : 0,
      scoreText: `${item.earned.toFixed(2)} / ${item.max.toFixed(2)}`,
    }))
}

export function practiceResultInsight(totalScore, maxTotal) {
  const total = Number(totalScore)
  if (!Number.isFinite(total)) {
    return {
      tone: 'info',
      title: '成绩待公布',
      text: '分数明细将在教师公布成绩后显示；主观题得分以教师批改为准。',
    }
  }
  const max = Number(maxTotal)
  const rate = max > 0 ? total / max : null

  if (rate != null && rate >= 0.9) {
    return {
      tone: 'success',
      title: '完成情况较好',
      text: '本次练习完成情况较好，请继续保持。',
    }
  }
  if (rate != null && rate >= 0.6) {
    return {
      tone: 'warning',
      title: '仍有提升空间',
      text: '基础掌握尚可，建议复盘下方扣分题目。',
    }
  }
  if (rate != null) {
    return {
      tone: 'danger',
      title: '建议重点复习',
      text: '建议重点查看未得分题目，复习相关知识点。',
    }
  }

  if (max === 100) {
    if (total >= 90) {
      return { tone: 'success', title: '完成情况较好', text: '本次练习完成情况较好，请继续保持。' }
    }
    if (total >= 60) {
      return { tone: 'warning', title: '仍有提升空间', text: '基础掌握尚可，建议复盘下方扣分题目。' }
    }
    return { tone: 'danger', title: '建议重点复习', text: '建议重点查看未得分题目，复习相关知识点。' }
  }

  return {
    tone: 'info',
    title: '学习反馈',
    text: '请结合下方题目得分明细，复盘错题与薄弱知识点。',
  }
}

export function resultStatusLabel(status) {
  const s = String(status || '').trim()
  if (s === 'graded') return { label: '已批改', tagType: 'success' }
  if (s === 'submitted') return { label: '已提交', tagType: 'primary' }
  return { label: '已提交', tagType: 'primary' }
}

export function matchesQuestionFilter(row, filter) {
  if (!filter || filter === 'all') return true
  switch (filter) {
    case 'scored':
      return row.scoreStatus.key === 'full'
    case 'deducted':
      return row.scoreStatus.key === 'partial' || row.scoreStatus.key === 'zero'
    case 'subjective':
      return row.isSubjective
    default:
      return true
  }
}

export function filterQuestionRows(rows, filter) {
  return rows.filter((row) => matchesQuestionFilter(row, filter))
}

export function resolveTotalScoreTier(totalScore, maxTotal) {
  if (maxTotal === 100) {
    return practiceScoreTier(totalScore, 100)
  }
  return null
}
