/** 学生端习题练习列表 — 前端展示与聚合（不改后端） */

export function derivePracticeStatus(row) {
  if (row?.student_take_state === 'closed') {
    return { key: 'closed', label: '已截止', tagType: 'info' }
  }
  const s = String(row?.my_status || '').trim()
  if (s === 'graded') return { key: 'graded', label: '已批改', tagType: 'success' }
  if (s === 'submitted') return { key: 'submitted', label: '已提交', tagType: 'primary' }
  if (s === 'in_progress') return { key: 'in_progress', label: '进行中', tagType: 'primary' }
  if (!s) return { key: 'pending', label: '待作答', tagType: 'warning' }
  return { key: 'abnormal', label: '未完成', tagType: 'danger' }
}

export function practiceActionMeta(row) {
  const st = derivePracticeStatus(row)
  if (st.key === 'closed') {
    return { label: '已截止', disabled: true, buttonType: 'info' }
  }
  if (st.key === 'graded') {
    return { label: '查看结果', disabled: false, buttonType: 'primary' }
  }
  if (st.key === 'submitted') {
    return { label: '查看作答', disabled: false, buttonType: 'primary' }
  }
  if (st.key === 'in_progress') {
    return { label: '继续练习', disabled: false, buttonType: 'primary' }
  }
  if (st.key === 'pending') {
    return { label: '开始练习', disabled: false, buttonType: 'primary' }
  }
  return { label: '查看详情', disabled: false, buttonType: 'default' }
}

export function formatPracticeScore(value) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(2)} 分`
}

/** 仅当明确满分为 100 时返回等级标签 */
export function practiceScoreTier(score, maxScore) {
  if (maxScore == null || Number(maxScore) !== 100) return null
  const n = Number(score)
  if (!Number.isFinite(n)) return null
  if (n >= 90) return { key: 'excellent', label: '优秀', tagType: 'success' }
  if (n >= 80) return { key: 'good', label: '良好', tagType: 'primary' }
  if (n >= 60) return { key: 'fair', label: '待提升', tagType: 'warning' }
  return { key: 'poor', label: '需改进', tagType: 'danger' }
}

export function computePracticeSummary(rows = []) {
  let pending = 0
  let submitted = 0
  let graded = 0
  const scoreList = []

  for (const row of rows) {
    const st = derivePracticeStatus(row)
    if (st.key === 'pending' || st.key === 'in_progress') pending += 1
    if (st.key === 'submitted') submitted += 1
    if (st.key === 'graded') graded += 1
    if (row.total_score != null && row.total_score !== '') {
      const n = Number(row.total_score)
      if (Number.isFinite(n)) scoreList.push(n)
    }
  }

  const avg =
    scoreList.length > 0
      ? (scoreList.reduce((s, n) => s + n, 0) / scoreList.length).toFixed(2)
      : '—'

  return {
    total: rows.length,
    pending,
    submitted,
    graded,
    avg,
  }
}

export function matchesPracticeStatusFilter(row, filter) {
  if (!filter) return true
  const st = derivePracticeStatus(row)
  switch (filter) {
    case 'pending':
      return st.key === 'pending' || st.key === 'in_progress'
    case 'submitted':
      return st.key === 'submitted'
    case 'graded':
      return st.key === 'graded'
    case 'closed':
      return st.key === 'closed'
    default:
      return true
  }
}

export function filterPracticeRows(rows, { keyword, status }) {
  const kw = (keyword || '').trim().toLowerCase()
  return rows.filter((row) => {
    if (!matchesPracticeStatusFilter(row, status)) return false
    if (!kw) return true
    return String(row.title || '').toLowerCase().includes(kw)
  })
}

export function sortPracticeRows(rows, sortBy) {
  const list = [...rows]
  switch (sortBy) {
    case 'score':
      list.sort((a, b) => {
        const sa = a.total_score != null && a.total_score !== '' ? Number(a.total_score) : -Infinity
        const sb = b.total_score != null && b.total_score !== '' ? Number(b.total_score) : -Infinity
        return sb - sa
      })
      break
    case 'published':
      list.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
      break
    case 'deadline':
    default:
      list.sort((a, b) => {
        const da = a.deadline_at ? new Date(a.deadline_at).getTime() : Infinity
        const db = b.deadline_at ? new Date(b.deadline_at).getTime() : Infinity
        return da - db
      })
  }
  return list
}

export function enrichPracticeRow(row) {
  const status = derivePracticeStatus(row)
  const action = practiceActionMeta(row)
  const maxScore = row.max_score != null ? Number(row.max_score) : null
  const scoreTier =
    row.total_score != null && row.total_score !== ''
      ? practiceScoreTier(row.total_score, maxScore)
      : null
  const questionCount =
    row.question_count != null && row.question_count !== ''
      ? Number(row.question_count)
      : null

  return {
    ...row,
    displayStatus: status,
    displayAction: action,
    displayScore: formatPracticeScore(row.total_score),
    scoreTier,
    questionCountText:
      questionCount != null && Number.isFinite(questionCount) ? `${questionCount} 题` : '—',
  }
}
