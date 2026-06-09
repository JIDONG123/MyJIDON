import { qbExamPhaseLabel, qbExamPhaseTagType } from './qbLabels'

export function examPhaseKey(row) {
  return String(row?.phase?.phase || '').trim()
}

export function scoresPublished(row) {
  const pub = row?.publish_scores_at
  if (!pub) return true
  const t = new Date(pub).getTime()
  return Number.isFinite(t) ? Date.now() >= t : true
}

export function canViewExamScore(row) {
  if (!row?.submitted_at) return false
  return scoresPublished(row)
}

export function examActionMeta(row) {
  const ph = examPhaseKey(row)
  const submitted = !!row?.submitted_at
  const scoreVisible = canViewExamScore(row)

  if (ph === 'active' && !submitted) {
    return { label: '进入考试', disabled: false, buttonType: 'primary', route: true }
  }
  if (ph === 'active' && submitted && scoreVisible) {
    return { label: '查看成绩', disabled: false, buttonType: 'success', route: true, plain: true }
  }
  if (ph === 'active' && submitted) {
    return { label: '成绩未公布', disabled: true, buttonType: 'info', route: false }
  }
  if (ph === 'upcoming') {
    return { label: '未开始', disabled: true, buttonType: 'info', route: false }
  }
  if (ph === 'ended' && submitted && scoreVisible) {
    return { label: '查看成绩', disabled: false, buttonType: 'primary', route: true }
  }
  if (ph === 'ended' && submitted) {
    return { label: '成绩未公布', disabled: true, buttonType: 'info', route: false }
  }
  if (ph === 'ended' && !submitted) {
    return { label: '已结束', disabled: true, buttonType: 'info', route: false }
  }
  return { label: '查看', disabled: false, buttonType: 'default', route: true }
}

export function examAccessMeta(row) {
  const ph = examPhaseKey(row)
  const submitted = !!row?.submitted_at
  const scoreVisible = canViewExamScore(row)

  let enterable = ph === 'active' && !submitted
  let scoreReadable = submitted && scoreVisible

  return {
    enterable,
    scoreReadable,
    enterLabel: enterable ? '可进入' : ph === 'upcoming' ? '未开放' : submitted ? '已交卷' : '不可进入',
    scoreLabel: scoreReadable ? '可查成绩' : submitted ? '成绩未公布' : '暂无成绩',
  }
}

export function examPhaseDisplay(row) {
  const ph = examPhaseKey(row)
  return {
    key: ph,
    label: qbExamPhaseLabel(ph),
    tagType: ph === 'active' ? 'success' : ph === 'upcoming' ? 'primary' : ph === 'ended' ? 'info' : 'warning',
  }
}

export function computeExamSummary(rows = []) {
  let active = 0
  let upcoming = 0
  let ended = 0
  for (const row of rows) {
    const ph = examPhaseKey(row)
    if (ph === 'active') active += 1
    else if (ph === 'upcoming') upcoming += 1
    else if (ph === 'ended') ended += 1
  }
  return { total: rows.length, active, upcoming, ended }
}

export function matchesExamPhaseFilter(row, filter) {
  if (!filter) return true
  return examPhaseKey(row) === filter
}

export function filterExamRows(rows, { keyword, phase }) {
  const kw = (keyword || '').trim().toLowerCase()
  return rows.filter((row) => {
    if (!matchesExamPhaseFilter(row, phase)) return false
    if (!kw) return true
    return String(row.title || '').toLowerCase().includes(kw)
  })
}

export function enrichExamRow(row) {
  return {
    ...row,
    displayPhase: examPhaseDisplay(row),
    displayAction: examActionMeta(row),
    displayAccess: examAccessMeta(row),
  }
}
