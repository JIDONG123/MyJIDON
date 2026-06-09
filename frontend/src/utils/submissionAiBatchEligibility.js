const REASON_MESSAGES = {
  not_submitted: '未提交，无法 AI 批改',
  ai_completed: '已完成 AI 批改，不能重复批改',
  ai_running: 'AI 批改中，请勿重复提交',
  ai_queued: '已进入批改队列，请等待完成',
  teacher_review_pending: 'AI 已完成，等待教师复核',
  teacher_reviewed: '已人工复核，不能重复批改',
  safety_review_required: '内容安全待复核，暂不能 AI 批改',
  safety_blocked: '内容安全未通过，不能 AI 批改',
  code_run_required: '代码运行检查未完成，暂不能 AI 批改',
  no_permission: '当前账号无权限批改该提交',
  eligible: '',
}

function ineligible(reasonCode, reason) {
  return {
    eligible: false,
    reasonCode,
    reason: reason || REASON_MESSAGES[reasonCode] || reasonCode,
  }
}

function eligibleResult() {
  return { eligible: true, reasonCode: 'eligible', reason: '' }
}

export function isCodeRunSummaryBlocking(summary, codeRunEnabled) {
  if (!codeRunEnabled) return false
  const s = String(summary || '').trim()
  if (!s) return true
  if (s === '排队中…' || s === '未运行') return true
  if (/排队|运行中|执行中/.test(s)) return true
  return false
}

/**
 * @param {object} row
 * @param {{ codeRunEnabled?: boolean, canGrade?: boolean, preferBackend?: boolean }} [options]
 */
export function getSubmissionAiBatchEligibility(row, options = {}) {
  const { codeRunEnabled = false, canGrade = true, preferBackend = true } = options

  if (
    preferBackend &&
    row &&
    row._rowType === 'submitted' &&
    typeof row.aiBatchEligible === 'boolean'
  ) {
    if (row.aiBatchEligible) {
      return eligibleResult()
    }
    return ineligible(
      row.aiBatchDisabledReasonCode || 'not_submitted',
      row.aiBatchDisabledReason || REASON_MESSAGES[row.aiBatchDisabledReasonCode]
    )
  }

  if (!row || row._rowType !== 'submitted') {
    return ineligible('not_submitted')
  }

  if (canGrade === false) {
    return ineligible('no_permission')
  }

  const status = row.status || 'pending'
  const activeItem = row.active_grading_item_status || null

  if (status === 'human_graded') {
    return ineligible('teacher_reviewed')
  }

  if (status === 'ai_graded') {
    return ineligible('teacher_review_pending')
  }

  if (['pending', 'queued'].includes(activeItem)) {
    return ineligible('ai_queued')
  }

  if (activeItem === 'running' || (status === 'ai_grading' && activeItem)) {
    return ineligible('ai_running')
  }

  const safety = row.safety_status || 'passed'
  if (safety === 'pending_review') {
    return ineligible('safety_review_required')
  }
  if (safety === 'rejected' || safety === 'manual_rejected') {
    return ineligible('safety_blocked')
  }

  if (isCodeRunSummaryBlocking(row.code_run_summary, codeRunEnabled)) {
    return ineligible('code_run_required')
  }

  return eligibleResult()
}

/**
 * 成果批改表格操作列按钮状态
 * @param {object} row
 * @param {{ codeRunEnabled?: boolean, canGrade?: boolean, preferBackend?: boolean }} [options]
 */
export function getSubmissionRowActions(row, options = {}) {
  if (!row || row._rowType !== 'submitted') {
    return {
      showPrimary: false,
      showView: false,
      showMore: false,
      showRegradeInMore: false,
    }
  }

  const status = row.status || 'pending'
  const activeItem = row.active_grading_item_status || null
  const elig = getSubmissionAiBatchEligibility(row, options)

  if (status === 'ai_failed') {
    return {
      showPrimary: true,
      primaryLabel: '重试 AI 批改',
      primaryAction: 'grade',
      primaryType: 'warning',
      primaryDisabled: false,
      showView: true,
      showMore: true,
      showRegradeInMore: false,
    }
  }

  if (status === 'ai_grading' && !activeItem) {
    return {
      showPrimary: true,
      primaryLabel: '重试 AI 批改',
      primaryAction: 'grade',
      primaryType: 'warning',
      primaryDisabled: false,
      showView: true,
      showMore: true,
      showRegradeInMore: false,
    }
  }

  if (status === 'ai_grading' || ['pending', 'queued', 'running'].includes(activeItem)) {
    return {
      showPrimary: true,
      primaryLabel: '批改中',
      primaryAction: null,
      primaryType: 'info',
      primaryDisabled: true,
      showView: true,
      showMore: true,
      showRegradeInMore: false,
    }
  }

  const completedReasons = new Set(['teacher_review_pending', 'teacher_reviewed', 'ai_completed'])
  if (completedReasons.has(elig.reasonCode)) {
    return {
      showPrimary: false,
      showView: true,
      showMore: true,
      showRegradeInMore: true,
    }
  }

  if (!elig.eligible && (elig.reasonCode === 'ai_running' || elig.reasonCode === 'ai_queued')) {
    return {
      showPrimary: true,
      primaryLabel: '批改中',
      primaryAction: null,
      primaryType: 'info',
      primaryDisabled: true,
      showView: true,
      showMore: true,
      showRegradeInMore: false,
    }
  }

  if (status === 'ai_graded' || status === 'human_graded') {
    return {
      showPrimary: false,
      showView: true,
      showMore: true,
      showRegradeInMore: true,
    }
  }

  if (elig.eligible) {
    return {
      showPrimary: true,
      primaryLabel: 'AI 批改',
      primaryAction: 'grade',
      primaryType: 'success',
      primaryDisabled: false,
      showView: true,
      showMore: true,
      showRegradeInMore: false,
    }
  }

  return {
    showPrimary: false,
    showView: true,
    showMore: true,
    showRegradeInMore: false,
  }
}

export { REASON_MESSAGES }
