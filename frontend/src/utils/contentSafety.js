export function safetyStatusMeta(status) {
  const s = status || 'passed'
  if (s === 'pending_review') {
    return { text: '待复核', type: 'warning' }
  }
  if (s === 'rejected' || s === 'manual_rejected') {
    return { text: '已拦截', type: 'danger' }
  }
  if (s === 'manual_approved') {
    return { text: '已通过', type: 'success' }
  }
  return { text: '已通过', type: 'success' }
}

export function safetyStatusHint(status) {
  const s = status || 'passed'
  if (s === 'pending_review') {
    return '该提交包含待复核内容，暂不建议发起 AI 批改。'
  }
  if (s === 'rejected' || s === 'manual_rejected') {
    return '该提交包含被拦截内容，不能发起 AI 批改。'
  }
  return ''
}
