/** 题库题型 / 难度展示（数据仍存英文枚举，界面统一中文） */

export const QB_TYPE_LABELS = {
  single: '单选题',
  multi: '多选题',
  judge: '判断题',
  fill: '填空题',
  short: '简答题',
  code: '编程题',
}

export const QB_DIFFICULTY_LABELS = {
  easy: '易',
  medium: '中',
  hard: '难',
}

export function qbTypeLabel(type) {
  const k = String(type || '').trim()
  return QB_TYPE_LABELS[k] || k || '—'
}

export function qbDifficultyLabel(diff) {
  const k = String(diff || '').trim().toLowerCase()
  return QB_DIFFICULTY_LABELS[k] || String(diff || '') || '—'
}

/** Element Plus Tag 类型：难度可视化 */
export function qbDifficultyTagType(diff) {
  const k = String(diff || '').trim().toLowerCase()
  if (k === 'easy') return 'success'
  if (k === 'hard') return 'danger'
  if (k === 'medium') return 'warning'
  return 'info'
}

/** 练习/考试答卷状态（qb_*_attempts.status） */
export const QB_ATTEMPT_STATUS_LABELS = {
  in_progress: '作答中',
  submitted: '待批改',
  graded: '已批改',
}

export function qbAttemptStatusLabel(s) {
  const k = String(s || '').trim()
  return QB_ATTEMPT_STATUS_LABELS[k] || (k ? k : '—')
}

export function qbAttemptStatusTagType(s) {
  const k = String(s || '').trim()
  if (k === 'graded') return 'success'
  if (k === 'submitted') return 'warning'
  if (k === 'in_progress') return 'info'
  return ''
}

/** 学生端考试阶段（phase.phase） */
export const QB_EXAM_PHASE_LABELS = {
  upcoming: '未开始',
  active: '进行中',
  ended: '已结束',
  hidden: '未开放',
}

export function qbExamPhaseLabel(phase) {
  const k = String(phase || '').trim()
  return QB_EXAM_PHASE_LABELS[k] || k || '—'
}

export function qbExamPhaseTagType(phase) {
  const k = String(phase || '').trim()
  if (k === 'active') return 'success'
  if (k === 'upcoming') return 'info'
  if (k === 'ended') return 'danger'
  if (k === 'hidden') return 'warning'
  return 'info'
}

/** 练习/考试发布状态等 */
export const QB_PUBLISH_STATUS_LABELS = {
  published: '已发布',
  draft: '草稿',
  archived: '已归档',
}

export function qbPublishStatusLabel(s) {
  const k = String(s || '').trim()
  return QB_PUBLISH_STATUS_LABELS[k] || k || '—'
}

export function parseJsonLoose(val) {
  if (val == null || val === '') return null
  if (typeof val === 'object') return val
  try {
    return JSON.parse(String(val))
  } catch {
    return null
  }
}
