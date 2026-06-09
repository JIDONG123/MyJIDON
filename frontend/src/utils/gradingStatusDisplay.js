/**
 * 列表/详情中批改状态展示。
 * 已有提交但尚无 grading_results 记录时 status 为 null，应视为「待批改」。
 */
export function gradingStatusType(status) {
  if (status == null || status === '') return 'warning'
  const types = {
    pending: 'warning',
    ai_grading: 'warning',
    ai_failed: 'danger',
    ai_graded: 'warning',
    human_graded: 'success',
  }
  return types[status] || 'info'
}

export function gradingStatusText(status) {
  if (status == null || status === '') return '待批改'
  const texts = {
    pending: '待批改',
    ai_grading: 'AI批改中',
    ai_failed: '批改失败',
    ai_graded: 'AI已批改',
    human_graded: '人工已复核',
  }
  return texts[status] || String(status)
}
