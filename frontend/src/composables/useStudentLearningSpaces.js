import { ref, computed } from 'vue'

export const SOON_MS = 7 * 24 * 60 * 60 * 1000

export function createSpaceKey(type, id = null) {
  if (type === 'all') return 'all'
  if (type === 'legacy_class') return `legacy:${id}`
  if (type === 'teaching_class') return `tc:${id}`
  return 'all'
}

export function parseSpaceKey(key) {
  if (!key || key === 'all') return { type: 'all', id: null }
  if (key.startsWith('legacy:')) return { type: 'legacy_class', id: Number(key.slice(7)) }
  if (key.startsWith('tc:')) return { type: 'teaching_class', id: Number(key.slice(3)) }
  return { type: 'all', id: null }
}

export function isDeadlinePassed(deadline) {
  if (!deadline) return false
  const t = new Date(deadline).getTime()
  return !Number.isNaN(t) && t < Date.now()
}

export function isDeadlineSoon(deadline) {
  if (!deadline || isDeadlinePassed(deadline)) return false
  const t = new Date(deadline).getTime()
  return !Number.isNaN(t) && t - Date.now() <= SOON_MS
}

export function buildGradeMap(rows) {
  const map = new Map()
  for (const row of rows || []) {
    const tid = row.task_id
    if (tid == null) continue
    if (!map.has(tid)) map.set(tid, row)
  }
  return map
}

export function resolveUiStatus(task, gradeByTaskId) {
  const submitted = !!task.completed
  const expired = isDeadlinePassed(task.deadline)
  const grade = gradeByTaskId.get(task.id)

  if (expired && !submitted) return 'expired'
  if (!submitted) return 'unsubmitted'

  if (grade?.status === 'human_graded') return 'completed'
  if (grade?.status === 'ai_graded') return 'graded'
  if (grade?.status === 'pending' || grade?.status === 'ai_grading' || grade?.status === 'ai_failed') {
    return 'pending_grade'
  }
  if (grade?.status) return 'graded'
  return 'submitted'
}

export function enrichTasks(tasks, gradeByTaskId) {
  return (tasks || []).map((t) => ({
    ...t,
    uiStatus: resolveUiStatus(t, gradeByTaskId),
  }))
}

export function filterTasksForSpace(enrichedTasks, spaceKey, classId) {
  const { type, id } = parseSpaceKey(spaceKey)
  if (type === 'all') return enrichedTasks
  if (type === 'legacy_class') {
    return enrichedTasks.filter(
      (t) => !t.teaching_class_id && classId != null && Number(t.class_id) === Number(classId)
    )
  }
  if (type === 'teaching_class') {
    return enrichedTasks.filter((t) => Number(t.teaching_class_id) === Number(id))
  }
  return enrichedTasks
}

export function computeTaskStats(enrichedTasks) {
  const all = enrichedTasks || []
  return {
    total: all.length,
    unsubmitted: all.filter((t) => t.uiStatus === 'unsubmitted').length,
    pendingGrade: all.filter((t) => t.uiStatus === 'pending_grade' || t.uiStatus === 'submitted').length,
    completed: all.filter((t) => t.uiStatus === 'graded' || t.uiStatus === 'completed').length,
    soon: all.filter((t) => t.uiStatus === 'unsubmitted' && isDeadlineSoon(t.deadline)).length,
  }
}

function dash(v) {
  return v != null && String(v).trim() !== '' ? String(v).trim() : '--'
}

function legacyTasksForClass(enrichedTasks, classId) {
  return enrichedTasks.filter(
    (t) => !t.teaching_class_id && classId != null && Number(t.class_id) === Number(classId)
  )
}

function tcTasksForId(enrichedTasks, tcId) {
  return enrichedTasks.filter((t) => Number(t.teaching_class_id) === Number(tcId))
}

function inferTeacherFromTasks(taskList) {
  const name = (taskList || []).map((t) => t.creator_name).find(Boolean)
  return name ? dash(name) : '--'
}

function inferTermFromTasks(taskList) {
  const terms = [...new Set((taskList || []).map((t) => t.term_name).filter(Boolean))]
  return terms.length ? terms.join(' / ') : '--'
}

export function buildLearningSpaceCards({ user, teachingClasses, enrichedTasks, announcements }) {
  const cards = []
  const allStats = computeTaskStats(enrichedTasks)

  cards.push({
    key: 'all',
    type: 'all',
    id: null,
    title: '全部任务',
    tag: '汇总',
    tagVariant: 'all',
    description: '查看行政班与所有教学班下的全部任务。',
    meta: {},
    stats: allStats,
    hoverRows: [
      { label: '全部任务', value: allStats.total },
      { label: '待提交', value: allStats.unsubmitted },
      { label: '待批改', value: allStats.pendingGrade },
      { label: '已完成', value: allStats.completed },
      { label: '即将截止', value: allStats.soon },
    ],
  })

  const classId = user?.classId
  if (classId) {
    const legacyTasks = legacyTasksForClass(enrichedTasks, classId)
    const legacyStats = computeTaskStats(legacyTasks)
    const major = user.classMajor ?? user.class_major
    const grade = user.classGrade ?? user.class_grade
    const className = user.className || user.class_name || `班级 #${classId}`
    const teacher = user.classTeacher?.realName || '--'
    const term = inferTermFromTasks(legacyTasks)
    const annCount = (announcements || []).length

    cards.push({
      key: createSpaceKey('legacy_class', classId),
      type: 'legacy_class',
      id: classId,
      title: className,
      tag: '行政班',
      tagVariant: 'legacy',
      description: '',
      meta: {
        major: dash(major),
        grade: dash(grade),
        term,
        teacher,
        course: null,
      },
      stats: { ...legacyStats, announcementCount: annCount },
      hoverRows: [
        { label: '行政班', value: className },
        { label: '专业', value: dash(major) },
        { label: '学期', value: term },
        { label: '负责教师', value: teacher },
        { label: '全部任务', value: legacyStats.total },
        { label: '待提交', value: legacyStats.unsubmitted },
        { label: '已完成', value: legacyStats.completed },
        { label: '公告', value: annCount },
      ],
    })
  }

  for (const tc of teachingClasses || []) {
    const tcTasks = tcTasksForId(enrichedTasks, tc.id)
    const tcStats = computeTaskStats(tcTasks)
    const teacher = inferTeacherFromTasks(tcTasks)

    cards.push({
      key: createSpaceKey('teaching_class', tc.id),
      type: 'teaching_class',
      id: tc.id,
      title: tc.class_name || `教学班 #${tc.id}`,
      tag: '教学班',
      tagVariant: 'teaching',
      description: '',
      meta: {
        course: dash(tc.course_name),
        term: dash(tc.term_name),
        teacher,
      },
      stats: tcStats,
      hoverRows: [
        { label: '教学班', value: dash(tc.class_name) },
        { label: '课程', value: dash(tc.course_name) },
        { label: '任课教师', value: teacher },
        { label: '学期', value: dash(tc.term_name) },
        { label: '全部任务', value: tcStats.total },
        { label: '待提交', value: tcStats.unsubmitted },
        { label: '待批改', value: tcStats.pendingGrade },
        { label: '已完成', value: tcStats.completed },
        { label: '即将截止', value: tcStats.soon },
      ],
    })
  }

  return cards
}

export function currentViewLabel(spaceKey, spaceCards) {
  const card = spaceCards.find((c) => c.key === spaceKey)
  if (!card) return '全部任务'
  if (card.type === 'all') return '全部任务'
  if (card.type === 'teaching_class') {
    const course = card.meta?.course && card.meta.course !== '--' ? card.meta.course : ''
    return course ? `${card.title} / ${course}` : card.title
  }
  return card.title
}

export function announcementSectionTitle(spaceKey) {
  const { type } = parseSpaceKey(spaceKey)
  if (type === 'legacy_class') return '行政班公告'
  if (type === 'all') return '最新公告'
  return '公告'
}

/** 教学班无公告 API：不展示公告模块 */
export function shouldShowAnnouncementPanel(spaceKey, visibleAnnouncements) {
  const { type } = parseSpaceKey(spaceKey)
  if (type === 'teaching_class') return false
  return (visibleAnnouncements || []).length > 0
}

export function announcementsForSpace(allAnnouncements, spaceKey) {
  const { type } = parseSpaceKey(spaceKey)
  if (type === 'teaching_class') return []
  const list = allAnnouncements || []
  if (type === 'all') {
    return list.map((a) => ({ ...a, _sourceLabel: '行政班公告' }))
  }
  return list.map((a) => ({ ...a, _sourceLabel: '行政班公告' }))
}

export function matchStatusFilter(uiStatus, filterKey) {
  if (filterKey === 'all') return true
  if (filterKey === 'unsubmitted') return uiStatus === 'unsubmitted'
  if (filterKey === 'submitted') return ['submitted', 'pending_grade', 'graded', 'completed'].includes(uiStatus)
  if (filterKey === 'pending_grade') return uiStatus === 'pending_grade' || uiStatus === 'submitted'
  if (filterKey === 'graded') return uiStatus === 'graded' || uiStatus === 'completed'
  if (filterKey === 'expired') return uiStatus === 'expired'
  return true
}

export function statusLabel(uiStatus) {
  const m = {
    unsubmitted: '未提交',
    submitted: '已提交',
    pending_grade: '待批改',
    graded: '已批改',
    completed: '已完成',
    expired: '已截止',
  }
  return m[uiStatus] || uiStatus
}

export function actionLabel(uiStatus) {
  const m = {
    unsubmitted: '上传成果',
    submitted: '查看提交',
    pending_grade: '查看提交',
    graded: '查看报告',
    completed: '查看报告',
    expired: '查看详情',
  }
  return m[uiStatus] || '查看详情'
}

export function isImportantAnn(ann) {
  const text = `${ann?.title || ''}${ann?.content || ''}`
  return /重要|紧急|务必|注意/.test(text)
}

export function annSummary(content) {
  if (!content) return '（无正文摘要）'
  const line = String(content).replace(/\s+/g, ' ').trim()
  return line.length > 80 ? `${line.slice(0, 80)}…` : line
}

export function useStudentLearningSpaces() {
  const selectedSpaceKey = ref('all')

  function selectSpace(key) {
    selectedSpaceKey.value = key
  }

  return {
    selectedSpaceKey,
    selectSpace,
  }
}
