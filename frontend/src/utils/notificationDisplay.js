/**
 * 站内通知展示文案（含 grading_job 与旧 grade_* 类型）
 */

const TYPE_META = {
  task_published: { label: '任务', tag: 'primary' },
  grade_ai: { label: 'AI批改', tag: 'success' },
  grade_final: { label: '成绩', tag: 'success' },
  grade_job_completed: { label: '批改完成', tag: 'success' },
  grade_job_partial: { label: '部分失败', tag: 'warning' },
  grade_job_failed: { label: '批改失败', tag: 'danger' },
  grade_job_cancelled: { label: '已取消', tag: 'info' },
  submission_feedback: { label: '作业反馈', tag: 'warning' },
  submission_feedback_reply: { label: '反馈回复', tag: 'success' },
  submission_feedback_rejected: { label: '反馈驳回', tag: 'danger' },
  submission_returned: { label: '作业退回', tag: 'primary' },
};

export function notificationTypeMeta(type) {
  return TYPE_META[type] || { label: '消息', tag: 'info' };
}

export function isGradingJobNotification(n) {
  return n?.ref_type === 'grading_job' || String(n?.type || '').startsWith('grade_job_');
}

export function notificationNavigateHint(n, role = 'teacher') {
  if (isGradingJobNotification(n)) {
    return role === 'admin' ? '查看批改任务详情' : '查看批改任务详情';
  }
  if (n?.ref_type === 'submission') return '查看批改结果';
  if (n?.ref_type === 'submission_feedback') return '查看作业反馈';
  if (n?.ref_type === 'task') return '查看任务提交';
  return '';
}
