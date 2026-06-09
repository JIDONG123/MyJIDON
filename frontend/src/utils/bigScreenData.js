/** 成绩分段固定顺序 */
export const SCORE_BUCKET_ORDER = ['<60', '60-69', '70-79', '80-89', '90+']

export function normalizeScoreBuckets(buckets) {
  const map = Object.fromEntries((buckets || []).map((b) => [b.bucket, Number(b.cnt) || 0]))
  return SCORE_BUCKET_ORDER.map((bucket) => ({ bucket, cnt: map[bucket] || 0 }))
}

const WEAK_TAG_RULES = [
  { tag: '代码规范', keys: ['代码规范', '命名', '格式', '缩进', '注释'] },
  { tag: '功能实现', keys: ['功能', '逻辑', '实现', '需求', '算法'] },
  { tag: '提交规范', keys: ['提交', '附件', '文件', '命名规范', '压缩'] },
  { tag: '页面实现', keys: ['页面', '界面', 'UI', '布局', '样式', '前端'] },
  { tag: '测试覆盖', keys: ['测试', '用例', '边界'] },
  { tag: '文档说明', keys: ['文档', '说明', '报告'] },
]

function inferWeakTag(text) {
  const t = String(text || '')
  for (const rule of WEAK_TAG_RULES) {
    if (rule.keys.some((k) => t.includes(k))) return rule.tag
  }
  return '综合问题'
}

/** 将后端 weakHints 字符串列表聚合为 Top N 结构化项 */
export function aggregateWeakHints(hints, limit = 5) {
  const map = new Map()
  for (const raw of hints || []) {
    const full = String(raw || '').trim()
    if (!full) continue
    const tag = inferWeakTag(full)
    const desc = full.length > 96 ? `${full.slice(0, 96)}…` : full
    const key = `${tag}::${desc.slice(0, 48)}`
    const cur = map.get(key)
    if (cur) cur.count += 1
    else map.set(key, { tag, desc, count: 1 })
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit)
}

export function buildKpiItems(overview) {
  const o = overview || {}
  const studentCount = Number(o.studentCount) || 0
  const taskCount = Number(o.taskCount) || 0
  const submissionCount = Number(o.submissionCount) || 0
  const gradedCount = Number(o.gradedCount) || 0
  const pending = Math.max(0, submissionCount - gradedCount)
  const denom = studentCount * taskCount
  const completionRate =
    denom > 0 ? `${Math.min(100, Math.round((submissionCount / denom) * 100))}%` : '—'

  return [
    { key: 'students', label: '学生数', value: studentCount, icon: 'users', tone: 'blue' },
    { key: 'tasks', label: '任务数', value: taskCount, icon: 'tasks', tone: 'cyan' },
    { key: 'subs', label: '提交数', value: submissionCount, icon: 'upload', tone: 'green' },
    { key: 'graded', label: '已批改', value: gradedCount, icon: 'check', tone: 'teal' },
    {
      key: 'avg',
      label: '平均分',
      value: o.avgScore != null ? Number(o.avgScore).toFixed(1) : '—',
      icon: 'score',
      tone: 'purple',
    },
    {
      key: 'rate',
      label: '完成率',
      value: completionRate,
      icon: 'rate',
      tone: 'gold',
      sub: pending > 0 ? `待批 ${pending}` : '',
    },
  ]
}

/** 批改状态分布（前端聚合） */
export function buildGradingPie(overview) {
  const submissionCount = Number(overview?.submissionCount) || 0
  const gradedCount = Number(overview?.gradedCount) || 0
  const pending = Math.max(0, submissionCount - gradedCount)
  const studentCount = Number(overview?.studentCount) || 0
  const taskCount = Number(overview?.taskCount) || 0
  const expected = studentCount * taskCount
  const notSubmitted = Math.max(0, expected - submissionCount)
  return [
    { name: '已批改', value: gradedCount },
    { name: '待批改', value: pending },
    { name: '未提交', value: notSubmitted },
  ].filter((x) => x.value > 0)
}

/** 任务完成概览横向条（基于总览指标，非单任务明细） */
export function buildCompletionBars(overview) {
  const studentCount = Number(overview?.studentCount) || 0
  const taskCount = Number(overview?.taskCount) || 0
  const submissionCount = Number(overview?.submissionCount) || 0
  const gradedCount = Number(overview?.gradedCount) || 0
  const expected = Math.max(1, studentCount * taskCount)
  return [
    { name: '提交完成度', value: Math.round((submissionCount / expected) * 100) },
    { name: '批改完成度', value: Math.round((gradedCount / expected) * 100) },
    {
      name: '批改率(已交)',
      value: submissionCount > 0 ? Math.round((gradedCount / submissionCount) * 100) : 0,
    },
  ]
}

/** 薄弱标签分布（由 weakHints 聚合） */
export function buildWeakTagChart(hints) {
  const items = aggregateWeakHints(hints, 8)
  if (!items.length) return []
  const tagMap = new Map()
  for (const it of items) {
    tagMap.set(it.tag, (tagMap.get(it.tag) || 0) + it.count)
  }
  return [...tagMap.entries()].map(([name, value]) => ({ name, value }))
}
