import { langLabel } from './codeRunLanguages'

/** 语言标签 Element Plus type */
export function languageTagType(language) {
  const map = {
    python: 'primary',
    node: 'success',
    c: 'info',
    cpp: 'info',
    java: 'warning',
  }
  return map[language] ?? 'info'
}

export function publishStatusMeta(status) {
  const map = {
    published: { label: '已发布', type: 'success' },
    draft: { label: '未发布', type: 'info' },
    closed: { label: '已关闭', type: 'info' },
  }
  return map[status] || { label: status || '—', type: 'info' }
}

/** 最近保存状态 */
export function saveStatusMeta(attempt, template) {
  if (!attempt) {
    return { key: 'not_started', label: '未开始', type: 'info' }
  }
  const starter = template?.starterCode ?? ''
  const source = attempt.sourceCode ?? ''
  const updated = new Date(attempt.updatedAt).getTime()
  const created = new Date(attempt.createdAt).getTime()
  if (source !== starter || (Number.isFinite(updated) && Number.isFinite(created) && updated - created > 1500)) {
    return { key: 'saved', label: '已保存', type: 'primary' }
  }
  return { key: 'not_started', label: '未开始', type: 'info' }
}

/** 最近运行状态（基于 attempt.runCount，无 job 详情时 runCount>0 显示已运行） */
export function runStatusMeta(attempt) {
  if (!attempt || !attempt.runCount) {
    return { key: 'not_run', label: '未运行', type: 'info' }
  }
  return { key: 'ran', label: `已运行 ${attempt.runCount} 次`, type: 'success' }
}

/** 筛选：未开始 / 已开始 / 已运行 */
export function progressFilterKey(attempt, template) {
  if (!attempt) return 'not_started'
  if (attempt.runCount > 0) return 'run'
  const starter = template?.starterCode ?? ''
  const source = attempt.sourceCode ?? ''
  const updated = new Date(attempt.updatedAt).getTime()
  const created = new Date(attempt.createdAt).getTime()
  if (source !== starter || (Number.isFinite(updated) && Number.isFinite(created) && updated - created > 1500)) return 'started'
  return 'not_started'
}

export function langLabelSafe(code) {
  return langLabel(code)
}
