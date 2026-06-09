/** 三端统一节点颜色语义（低饱和、区分清晰） */
export const KG_COLORS = {
  course: '#4F7FD4',
  chapter: '#5B8DEF',
  administrative_class: '#2E5FA8',
  teaching_class: '#6B9AE8',
  teacher: '#4C5FD5',
  student: '#8B6CC1',
  task: '#3DAA7A',
  exercise: '#5BA88A',
  knowledge_point: '#2BA8B8',
  weakness: '#E8944A',
  error: '#DC6B6B',
  aggregate: '#94A3B8',
  edge: '#94A3B8',
  edgeHighlight: '#4F7FD4',
}

export const NODE_TYPE_META = {
  course: { label: '课程', color: KG_COLORS.course, symbol: 'roundRect', legendKey: 'course' },
  chapter: { label: '章节', color: KG_COLORS.chapter, symbol: 'roundRect', legendKey: 'chapter' },
  administrative_class: {
    label: '行政班',
    color: KG_COLORS.administrative_class,
    symbol: 'roundRect',
    legendKey: 'administrative_class',
  },
  teaching_class: {
    label: '教学班',
    color: KG_COLORS.teaching_class,
    symbol: 'roundRect',
    legendKey: 'teaching_class',
  },
  teacher: { label: '教师', color: KG_COLORS.teacher, symbol: 'circle', legendKey: 'teacher' },
  student: { label: '学生', color: KG_COLORS.student, symbol: 'circle', legendKey: 'student' },
  task: { label: '任务', color: KG_COLORS.task, symbol: 'rect', legendKey: 'task' },
  exercise: { label: '习题', color: KG_COLORS.exercise, symbol: 'rect', legendKey: 'exercise' },
  knowledge_point: {
    label: '知识点',
    color: KG_COLORS.knowledge_point,
    symbol: 'circle',
    legendKey: 'knowledge_point',
  },
  weakness: { label: '薄弱点', color: KG_COLORS.weakness, symbol: 'diamond', legendKey: 'weakness' },
  error: { label: '高频错误', color: KG_COLORS.error, symbol: 'diamond', legendKey: 'error' },
  aggregate: {
    label: '聚合节点',
    color: KG_COLORS.aggregate,
    symbol: 'roundRect',
    legendKey: 'aggregate',
  },
}

export const LEGEND_ITEMS = [
  {
    key: 'course_chapter',
    label: '课程/章节',
    types: ['course', 'chapter'],
    color: KG_COLORS.course,
  },
  {
    key: 'administrative_class',
    label: '行政班',
    types: ['administrative_class'],
    color: KG_COLORS.administrative_class,
  },
  {
    key: 'teaching_class',
    label: '教学班',
    types: ['teaching_class'],
    color: KG_COLORS.teaching_class,
  },
  { key: 'teacher', label: '教师', types: ['teacher'], color: KG_COLORS.teacher },
  { key: 'task', label: '任务', types: ['task'], color: KG_COLORS.task },
  { key: 'exercise', label: '习题', types: ['exercise'], color: KG_COLORS.exercise },
  {
    key: 'knowledge_point',
    label: '知识点',
    types: ['knowledge_point'],
    color: KG_COLORS.knowledge_point,
  },
  { key: 'student', label: '学生', types: ['student'], color: KG_COLORS.student },
  { key: 'weakness', label: '薄弱点', types: ['weakness'], color: KG_COLORS.weakness },
  { key: 'error', label: '高频错误', types: ['error'], color: KG_COLORS.error },
]

/** 管理端总览可见节点（不含学生个人节点） */
export const ADMIN_VISIBLE_NODE_TYPES = [
  'course',
  'chapter',
  'administrative_class',
  'teaching_class',
  'teacher',
  'task',
  'exercise',
  'knowledge_point',
  'weakness',
  'error',
  'aggregate',
]

/** 管理端图例（与后端 getCourseGraph 返回范围一致） */
export const ADMIN_LEGEND_ITEMS = [
  {
    key: 'course_chapter',
    label: '课程/章节',
    types: ['course', 'chapter'],
    color: KG_COLORS.course,
  },
  {
    key: 'administrative_class',
    label: '行政班',
    types: ['administrative_class'],
    color: KG_COLORS.administrative_class,
  },
  {
    key: 'teaching_class',
    label: '教学班',
    types: ['teaching_class'],
    color: KG_COLORS.teaching_class,
  },
  { key: 'teacher', label: '教师', types: ['teacher'], color: KG_COLORS.teacher },
  { key: 'task', label: '任务', types: ['task'], color: KG_COLORS.task },
  { key: 'exercise', label: '习题', types: ['exercise'], color: KG_COLORS.exercise },
  {
    key: 'knowledge_point',
    label: '知识点',
    types: ['knowledge_point'],
    color: KG_COLORS.knowledge_point,
  },
  { key: 'weakness', label: '薄弱点', types: ['weakness'], color: KG_COLORS.weakness },
  { key: 'error', label: '高频错误', types: ['error'], color: KG_COLORS.error },
]

/** 教师端图例 */
export const TEACHER_LEGEND_ITEMS = LEGEND_ITEMS.filter(
  (item) => !['teacher'].includes(item.key)
)

/** 学生端图例 */
export const STUDENT_LEGEND_ITEMS = LEGEND_ITEMS.filter(
  (item) => !['administrative_class', 'teaching_class', 'teacher', 'student'].includes(item.key)
)

export function visibleNodeTypesForRole(role) {
  if (role === 'admin') return ADMIN_VISIBLE_NODE_TYPES
  if (role === 'student') {
    return ['student', 'task', 'knowledge_point', 'weakness', 'error', 'aggregate']
  }
  return [
    'administrative_class',
    'teaching_class',
    'student',
    'task',
    'exercise',
    'knowledge_point',
    'weakness',
    'error',
    'aggregate',
  ]
}

export function legendItemsForRole(role) {
  if (role === 'admin') return ADMIN_LEGEND_ITEMS
  if (role === 'student') return STUDENT_LEGEND_ITEMS
  return TEACHER_LEGEND_ITEMS
}

export const ROLE_LIMITS = { admin: 120, teacher: 80, student: 40 }

export const LABEL_MAX_LEN = 12

export function truncateLabel(text, max = LABEL_MAX_LEN) {
  const s = String(text || '').trim()
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

export function colorForNodeType(type, opts = {}) {
  if (opts.isHighRisk || type === 'error') return KG_COLORS.error
  return NODE_TYPE_META[type]?.color || KG_COLORS.aggregate
}

export function symbolForNodeType(type) {
  if (type === 'aggregate') return 'roundRect'
  return NODE_TYPE_META[type]?.symbol || 'circle'
}

export function legendKeyForType(type) {
  return NODE_TYPE_META[type]?.legendKey || 'knowledge_point'
}

export function legendTypesForKey(key) {
  const item =
    LEGEND_ITEMS.find((i) => i.key === key) ||
    ADMIN_LEGEND_ITEMS.find((i) => i.key === key)
  return item?.types || []
}
