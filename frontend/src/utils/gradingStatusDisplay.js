/**
 * 列表/详情中批改状态展示（无 grading_results 时 status 常为 null）
 */
export function gradingStatusType(status) {
  if (status == null || status === '') return 'info'
  const types = {
    pending: 'info',
    ai_grading: 'warning',
    ai_failed: 'danger',
    ai_graded: 'warning',
    human_graded: 'success',
  }
  return types[status] || 'info'
}

export function gradingStatusText(status) {
  if (status == null || status === '') return '没有批改'
  const texts = {
    pending: '待批改',
    ai_grading: 'AI批改中',
    ai_failed: '批改失败',
    ai_graded: 'AI已批改',
    human_graded: '人工已复核',
  }
  return texts[status] || String(status)
}
