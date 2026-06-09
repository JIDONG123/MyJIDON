import { formatDateTime } from './format'

const SCENARIO_LABELS = {
  teaching: '教学',
  enterprise_collab: '校企',
  mixed: '综合',
}

export function scenarioLabel(type) {
  return SCENARIO_LABELS[type] || '综合'
}

export function taskDeadlineMeta(deadline) {
  if (!deadline) return { statusText: '未设置', tagType: 'info' }
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return { statusText: '—', tagType: 'info' }
  if (d.getTime() <= Date.now()) return { statusText: '已截止', tagType: 'danger' }
  return { statusText: '进行中', tagType: 'primary' }
}

export function publishScopeLabel(task) {
  if (!task) return { type: '行政班', name: '—' }
  if (task.teaching_class_id) {
    return { type: '教学班', name: task.teaching_class_name || '—' }
  }
  return { type: '行政班', name: task.class_name || '—' }
}

export function buildSubmissionKpis(submissions, overview, task) {
  const subs = submissions || []
  const unsub = overview?.unsubmitted || []
  const late = overview?.lateSubmitters || []
  const expected =
    Number(task?.classStudentCount) ||
    unsub.length + new Set(subs.map((s) => s.student_id)).size ||
    0

  const pendingAi = subs.filter(
    (s) => !s.status || s.status === 'pending' || s.status === 'ai_failed' || s.status === 'ai_grading'
  ).length
  const pendingReview = subs.filter((s) => s.status === 'ai_graded').length
  const aiDone = subs.filter((s) => ['ai_graded', 'human_graded'].includes(s.status)).length
  const completed = subs.filter((s) => s.status === 'human_graded').length

  return {
    expected: expected || '—',
    submitted: subs.length,
    unsubmitted: unsub.length,
    late: late.length,
    aiGraded: aiDone,
    pendingReview,
    completed,
    pendingAi,
  }
}

export function buildLateStudentIdSet(overview) {
  return new Set((overview?.lateSubmitters || []).map((x) => Number(x.id)))
}

export function enrichSubmissionRow(row, lateIds, taskClassName) {
  const late = lateIds.has(Number(row.student_id))
  return {
    ...row,
    _rowType: 'submitted',
    _late: late,
    _filterKeys: computeSubmittedFilterKeys(row, late),
    class_name: row.class_name || taskClassName || '—',
  }
}

export function buildUnsubmittedRows(overview, taskClassName) {
  return (overview?.unsubmitted || []).map((u) => ({
    id: null,
    student_id: u.id,
    student_name: u.real_name || u.username || '—',
    class_name: taskClassName || '—',
    file_name: null,
    submitted_at: null,
    is_revised: false,
    total_score: null,
    final_score: null,
    human_score: null,
    max_similarity: null,
    status: null,
    code_run_summary: null,
    _rowType: 'unsubmitted',
    _late: false,
    _filterKeys: ['all', 'unsubmitted'],
  }))
}

function computeSubmittedFilterKeys(row, late) {
  const keys = ['all', 'submitted']
  if (late) keys.push('late')
  const st = row.status
  if (!st || st === 'pending' || st === 'ai_failed' || st === 'ai_grading') keys.push('pending_ai')
  if (st === 'ai_graded') keys.push('pending_review')
  if (st === 'human_graded') keys.push('completed')
  return keys
}

export function filterDisplayRows(allRows, filterKey) {
  if (!filterKey || filterKey === 'all') return allRows
  return allRows.filter((r) => r._filterKeys?.includes(filterKey))
}

export function mergeAllRows(submissions, overview, task) {
  const scopeName = publishScopeLabel(task).name
  const lateIds = buildLateStudentIdSet(overview)
  const submitted = (submissions || []).map((r) => enrichSubmissionRow(r, lateIds, scopeName))
  const unsubmitted = buildUnsubmittedRows(overview, scopeName)
  return [...submitted, ...unsubmitted]
}

export function submitStatusMeta(row) {
  if (row._rowType === 'unsubmitted') return { text: '未提交', type: 'info' }
  if (row.is_revised) return { text: '已修改', type: 'warning' }
  if (row._late) return { text: '超时提交', type: 'danger' }
  return { text: '已提交', type: 'primary' }
}

export function aiGradingMeta(status, activeItemStatus = null) {
  const activeItem = activeItemStatus || null
  if (status == null || status === '' || status === 'pending') {
    if (['pending', 'queued'].includes(activeItem)) {
      return { text: '待批改', type: 'warning' }
    }
    return { text: '未批改', type: 'info' }
  }
  const map = {
    ai_grading: { text: '批改中', type: 'primary' },
    ai_failed: { text: '失败', type: 'danger' },
    ai_graded: { text: '已完成', type: 'success' },
    human_graded: { text: '已完成', type: 'success' },
  }
  return map[status] || { text: '未批改', type: 'info' }
}

export function humanReviewMeta(status) {
  if (status === 'human_graded') return { text: '人工已复核', type: 'success' }
  if (status === 'ai_graded') return { text: '待复核', type: 'warning' }
  return { text: '—', type: 'info', muted: true }
}

const FEEDBACK_STATUS_LABELS = {
  pending: '待处理',
  replied: '已回复',
  returned: '已退回',
  rejected: '已驳回',
  closed: '已关闭',
}

const FEEDBACK_STATUS_TAG = {
  pending: 'warning',
  replied: 'success',
  returned: 'primary',
  rejected: 'danger',
  closed: 'info',
}

export function feedbackStatusText(status) {
  return FEEDBACK_STATUS_LABELS[status] || '无'
}

export function feedbackStatusTag(status) {
  return FEEDBACK_STATUS_TAG[status] || 'info'
}

export function codeRunMeta(summary, enabled) {
  if (!enabled) return { text: '未启用', type: 'info' }
  const s = String(summary || '').trim()
  if (!s) return { text: '未运行', type: 'info' }
  if (/通过|成功|OK/i.test(s)) return { text: '通过', type: 'success' }
  if (/超时/.test(s)) return { text: '超时', type: 'danger' }
  if (/失败|错误|异常/.test(s)) return { text: '失败', type: 'danger' }
  if (/排队|运行中|执行中/.test(s)) return { text: '运行中', type: 'primary' }
  return { text: s.length > 10 ? `${s.slice(0, 10)}…` : s, type: 'primary' }
}

export function finalScoreDisplay(row) {
  const v = row.final_score ?? row.human_score ?? row.total_score
  if (v == null || v === '') return '—'
  return Number(v).toFixed(1).replace(/\.0$/, '')
}

export function aiScoreDisplay(row) {
  if (row.total_score == null || row.total_score === '') return '—'
  return Number(row.total_score).toFixed(1).replace(/\.0$/, '')
}

export function similarityDisplay(row) {
  if (row.max_similarity == null) return null
  return `${Number(row.max_similarity).toFixed(1)}%`
}

export function namesListText(list, field = 'real_name') {
  if (!list?.length) return ''
  return list.map((x) => x[field] || x.username || '—').join('、')
}

export function lateListText(list) {
  if (!list?.length) return ''
  return list
    .map((x) => `${x.real_name || x.username}（${formatDateTime(x.submitted_at)}）`)
    .join('；')
}

export const FILTER_TABS = [
  { key: 'all', label: '全部' },
  { key: 'submitted', label: '已提交' },
  { key: 'unsubmitted', label: '未提交' },
  { key: 'late', label: '超时提交' },
  { key: 'pending_ai', label: '待 AI 批改' },
  { key: 'pending_review', label: '待教师复核' },
  { key: 'completed', label: '已完成' },
]

export const KPI_CARDS = [
  { key: 'expected', label: '应交人数', filter: null, tone: 'slate', icon: 'users' },
  { key: 'submitted', label: '已提交', filter: 'submitted', tone: 'blue' },
  { key: 'unsubmitted', label: '未提交', filter: 'unsubmitted', tone: 'gray' },
  { key: 'late', label: '超时提交', filter: 'late', tone: 'orange' },
  { key: 'aiGraded', label: 'AI 已批改', filter: null, tone: 'green' },
  { key: 'pendingReview', label: '待教师复核', filter: 'pending_review', tone: 'amber' },
  { key: 'completed', label: '已复核', filter: 'completed', tone: 'teal' },
]
