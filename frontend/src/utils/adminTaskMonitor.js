/** 管理端全校任务监管台：截止、进度、智能评价与风险计算 */

export const DEADLINE_SOON_MS = 24 * 60 * 60 * 1000
export const LOW_SUBMIT_RATE = 0.6
export const LONG_REVIEW_MS = 3 * 24 * 60 * 60 * 1000

export function scenarioLabel(type) {
  const m = { teaching: '教学任务', enterprise_collab: '校企任务', mixed: '综合任务' }
  return m[type] || '教学任务'
}

export function formatCreatedDate(value) {
  if (value == null || value === '') return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

export function adminDeadlineMeta(deadline) {
  if (!deadline) return { statusText: '未开始', tagType: 'info' }
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return { statusText: '—', tagType: 'info' }
  const diff = d.getTime() - Date.now()
  if (diff <= 0) return { statusText: '已截止', tagType: 'danger' }
  if (diff <= DEADLINE_SOON_MS) return { statusText: '临近截止', tagType: 'warning' }
  return { statusText: '进行中', tagType: 'primary' }
}

export function publishScopeMeta(row) {
  if (row.scenario_type === 'enterprise_collab') {
    return { tag: '校企', type: 'warning' }
  }
  if (row.teaching_class_id) {
    return { tag: '教学班', type: 'primary' }
  }
  return { tag: '行政班', type: '' }
}

export function progressPercent(row) {
  const total = Number(row.classStudentCount)
  const sub = Number(row.submittedStudentCount ?? 0)
  if (!Number.isFinite(total) || total <= 0) return null
  return Math.min(100, Math.round((sub / total) * 1000) / 10)
}

export function submitRate(row) {
  const pct = progressPercent(row)
  return pct == null ? null : pct / 100
}

export function isLowSubmitRate(row) {
  const rate = submitRate(row)
  return rate != null && rate < LOW_SUBMIT_RATE
}

export function isAiGradingEnabled(task, detail) {
  const w = detail?.score_ai_weight ?? task?.score_ai_weight
  if (w === 0 || w === '0') return false
  return true
}

export function isEnterpriseEvalEnabled(task, detail) {
  if (task?.scenario_type === 'enterprise_collab') return true
  const w = detail?.enterprise_grade_weight ?? task?.enterprise_grade_weight
  if (w != null && w !== '' && Number(w) > 0) return true
  return false
}

export function isCodeRunFailure(summary) {
  const s = String(summary || '').toLowerCase()
  return (
    s.includes('失败') ||
    s.includes('fail') ||
    s.includes('error') ||
    s.includes('未通过') ||
    s.includes('运行错误')
  )
}

export function taskAiGradingMeta(task, subs, detail) {
  if (!isAiGradingEnabled(task, detail)) {
    return { text: '未启用', type: 'info' }
  }
  const rows = subs || []
  if (!rows.length) {
    const total = Number(task?.classStudentCount) || 0
    const sub = Number(task?.submittedStudentCount) || 0
    if (total > 0 && sub <= 0) return { text: '待批改', type: 'warning' }
    return { text: '待批改', type: 'warning' }
  }
  const failed = rows.filter((r) => r.status === 'ai_failed').length
  if (failed > 0) return { text: '异常', type: 'danger' }
  const review = rows.filter((r) => r.status === 'ai_graded').length
  const pending = rows.filter(
    (r) => r.status == null || r.status === '' || r.status === 'pending'
  ).length
  const done = rows.filter((r) =>
    ['human_graded', 'human_reviewed', 'completed'].includes(r.status)
  ).length
  if (review > 0) return { text: '待复核', type: 'warning' }
  if (pending > 0) return { text: '待批改', type: 'warning' }
  if (done === rows.length && rows.length > 0) return { text: '已完成', type: 'success' }
  return { text: '批改中', type: 'primary' }
}

export function taskCodeRunMeta(task, detail, subs) {
  if (!detail?.code_run_enabled) return { text: '未启用', type: 'info' }
  const rows = subs || []
  if (!rows.length) return { text: '已启用', type: 'primary' }
  const hasFail = rows.some((r) => isCodeRunFailure(r.code_run_summary))
  if (hasFail) return { text: '异常', type: 'danger' }
  return { text: '已启用', type: 'success' }
}

export function taskEnterpriseMeta(task, detail) {
  if (!isEnterpriseEvalEnabled(task, detail)) {
    return { text: '未启用', type: 'info' }
  }
  return { text: '已启用', type: 'success' }
}

export function humanReviewMeta(subs) {
  const rows = subs || []
  if (!rows.length) return { text: '—', type: 'info' }
  const pending = rows.filter((r) => r.status === 'ai_graded').length
  const done = rows.filter((r) =>
    ['human_graded', 'human_reviewed', 'completed'].includes(r.status)
  ).length
  if (pending > 0) return { text: `待复核 ${pending}`, type: 'warning' }
  if (done > 0) return { text: '已完成', type: 'success' }
  return { text: '—', type: 'info' }
}

export function computeScoreStats(subs) {
  const scores = (subs || [])
    .map((r) => {
      const v = r.final_score ?? r.total_score ?? r.human_score
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    })
    .filter((n) => n != null)
  if (!scores.length) {
    return { avg: null, max: null, min: null, reviewed: 0 }
  }
  const reviewed = (subs || []).filter((r) =>
    ['human_graded', 'human_reviewed', 'completed'].includes(r.status)
  ).length
  return {
    avg: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    max: Math.max(...scores),
    min: Math.min(...scores),
    reviewed,
  }
}

export function taskHasPendingGrade(task, subs, detail) {
  const meta = taskAiGradingMeta(task, subs, detail)
  return ['待批改', '批改中', '异常'].includes(meta.text)
}

export function taskHasPendingReview(subs) {
  return (subs || []).some((r) => r.status === 'ai_graded')
}

export function taskHasLongPendingReview(subs) {
  const now = Date.now()
  return (subs || []).some((r) => {
    if (r.status !== 'ai_graded') return false
    const t = new Date(r.submitted_at).getTime()
    return Number.isFinite(t) && now - t >= LONG_REVIEW_MS
  })
}

export function computeRiskAlerts(tasks, submissionMap, taskDetailMap) {
  const alerts = []

  const nearDeadline = tasks.filter((t) => adminDeadlineMeta(t.deadline).statusText === '临近截止')
  if (nearDeadline.length) {
    alerts.push({ key: 'near_deadline', label: '临近截止任务', count: nearDeadline.length })
  }

  const lowSubmit = tasks.filter((t) => isLowSubmitRate(t))
  if (lowSubmit.length) {
    alerts.push({ key: 'low_submit', label: '低提交率任务', count: lowSubmit.length })
  }

  const aiFailed = tasks.filter((t) => {
    const subs = submissionMap[t.id] || []
    return subs.some((r) => r.status === 'ai_failed')
  })
  if (aiFailed.length) {
    alerts.push({ key: 'ai_failed', label: 'AI 批改异常', count: aiFailed.length })
  }

  const codeRunFailed = tasks.filter((t) => {
    const detail = taskDetailMap[t.id]
    if (!detail?.code_run_enabled) return false
    const subs = submissionMap[t.id] || []
    return subs.some((r) => isCodeRunFailure(r.code_run_summary))
  })
  if (codeRunFailed.length) {
    alerts.push({ key: 'code_run_failed', label: '代码运行失败', count: codeRunFailed.length })
  }

  const longReview = tasks.filter((t) => taskHasLongPendingReview(submissionMap[t.id]))
  if (longReview.length) {
    alerts.push({ key: 'long_review', label: '长时间待复核', count: longReview.length })
  }

  const endedLowSubmit = tasks.filter((t) => {
    if (adminDeadlineMeta(t.deadline).statusText !== '已截止') return false
    const total = Number(t.classStudentCount) || 0
    const sub = Number(t.submittedStudentCount) || 0
    return total > 0 && sub < total
  })
  if (endedLowSubmit.length) {
    alerts.push({ key: 'submit_insufficient', label: '提交不足', count: endedLowSubmit.length })
  }

  return alerts
}
