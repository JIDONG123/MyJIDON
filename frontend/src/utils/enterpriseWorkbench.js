import { formatDateTime } from './format'

export const ENTERPRISE_QUICK_COMMENTS = [
  '工程完成度较好',
  '文档说明清晰',
  '代码结构较规范',
  '建议加强企业场景适配',
  '建议补充运行截图',
  '建议提升交付完整性',
]

export function enterpriseReviewMeta(row) {
  const score = row?.enterprise_score
  if (score != null && score !== '') {
    return { text: '企业已评价', type: 'success' }
  }
  return { text: '待评价', type: 'warning' }
}

export function similarityFilterMeta(level) {
  if (level === 'high' || level === 'warn') return { text: '预警', type: 'warning' }
  return { text: '正常', type: 'success' }
}

export function displayScore(value) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return String(n).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

export function studentNoDisplay(row) {
  return row?.student_no || row?.username || '—'
}

export function countSubmissionEnterpriseStats(rows = []) {
  let pending = 0
  let done = 0
  let lastAt = null
  for (const row of rows) {
    const reviewed =
      row.enterprise_score != null && row.enterprise_score !== ''
    if (reviewed) {
      done += 1
      const t = row.enterprise_graded_at
      if (t && (!lastAt || new Date(t) > new Date(lastAt))) lastAt = t
    } else {
      pending += 1
    }
  }
  return { pending, done, lastAt }
}

export function buildScopeGroups(tasks = [], submissionMap = {}) {
  const map = new Map()
  for (const t of tasks) {
    const subs = submissionMap[t.id] || []
    const { pending, done } = countSubmissionEnterpriseStats(subs)
    const taskStat = { pending, done, submissions: subs.length }

    if (t.teaching_class_id) {
      const key = `tc-${t.teaching_class_id}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          kind: 'teaching',
          scopeId: t.teaching_class_id,
          title: t.teaching_class_name || `教学班 #${t.teaching_class_id}`,
          subtitle: [t.course_name, t.term_name].filter(Boolean).join(' · '),
          tasks: [],
          taskCount: 0,
          pendingCount: 0,
          doneCount: 0,
        })
      }
      const g = map.get(key)
      g.tasks.push({ ...t, _stats: taskStat })
      g.taskCount += 1
      g.pendingCount += pending
      g.doneCount += done
    } else if (t.class_id) {
      const key = `cls-${t.class_id}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          kind: 'class',
          scopeId: t.class_id,
          title: t.class_name || `班级 #${t.class_id}`,
          subtitle: '',
          tasks: [],
          taskCount: 0,
          pendingCount: 0,
          doneCount: 0,
        })
      }
      const g = map.get(key)
      g.tasks.push({ ...t, _stats: taskStat })
      g.taskCount += 1
      g.pendingCount += pending
      g.doneCount += done
    }
  }
  return Array.from(map.values())
}

export function aggregateHomeStats(tasks = [], submissionMap = {}) {
  const scopeKeys = new Set()
  let pending = 0
  let done = 0
  let lastAt = null

  for (const t of tasks) {
    if (t.teaching_class_id) scopeKeys.add(`tc-${t.teaching_class_id}`)
    else if (t.class_id) scopeKeys.add(`cls-${t.class_id}`)

    const stats = countSubmissionEnterpriseStats(submissionMap[t.id] || [])
    pending += stats.pending
    done += stats.done
    if (stats.lastAt && (!lastAt || new Date(stats.lastAt) > new Date(lastAt))) {
      lastAt = stats.lastAt
    }
  }

  return {
    scopeCount: scopeKeys.size,
    taskCount: tasks.length,
    pending,
    done,
    lastReviewText: lastAt ? formatDateTime(lastAt) : '—',
  }
}

export function filterEnterpriseRows(rows, { reviewStatus, similarityStatus, keyword }) {
  let list = rows || []
  if (reviewStatus === 'pending') {
    list = list.filter((r) => r.enterprise_score == null || r.enterprise_score === '')
  } else if (reviewStatus === 'done') {
    list = list.filter((r) => r.enterprise_score != null && r.enterprise_score !== '')
  }
  if (similarityStatus === 'normal') {
    list = list.filter((r) => !r.similarity_level || r.similarity_level === 'normal')
  } else if (similarityStatus === 'warn') {
    list = list.filter((r) => r.similarity_level === 'warn' || r.similarity_level === 'high')
  }
  const kw = String(keyword || '').trim().toLowerCase()
  if (kw) {
    list = list.filter((r) => {
      const name = String(r.student_name || '').toLowerCase()
      const no = String(r.student_no || r.username || '').toLowerCase()
      return name.includes(kw) || no.includes(kw)
    })
  }
  return list
}

export function taskScopeLabel(task) {
  if (!task) return '—'
  if (task.teaching_class_id) return task.teaching_class_name || '教学班'
  return task.class_name || '行政班'
}
