/**
 * 学生端「我的班级学情看板」展示层（不改后端统计口径）
 */

import { pickArchiveScore } from './studentArchiveDisplay'
import { normalizeScoreBuckets, SCORE_BUCKET_ORDER } from './bigScreenData'

export { normalizeScoreBuckets, SCORE_BUCKET_ORDER }

export const SMALL_SAMPLE_THRESHOLD = 5

/** 将后端 weakHints（ai_problems 节选）聚合为匿名标签，不展示原文 */
const STUDENT_WEAK_TAG_RULES = [
  { tag: '异常处理不足', keys: ['异常', '错误', '报错', 'try', 'catch', '崩溃'] },
  { tag: '提交材料不完整', keys: ['提交', '材料', '附件', '缺失', '不完整', '压缩', '目录'] },
  { tag: '代码运行结果缺失', keys: ['运行', '截图', '结果', '输出', '执行', '验证'] },
  { tag: '页面组件实现不完整', keys: ['页面', '组件', '界面', 'ui', '布局', '样式', '前端'] },
  { tag: '文档说明不清晰', keys: ['文档', 'readme', '说明', '描述', '报告'] },
  { tag: '代码规范问题', keys: ['规范', '命名', '注释', '可读', 'lint'] },
  { tag: '功能实现不足', keys: ['功能', '逻辑', '实现', '需求', '完整'] },
]

function inferStudentWeakTag(text) {
  const t = String(text || '').toLowerCase()
  for (const rule of STUDENT_WEAK_TAG_RULES) {
    if (rule.keys.some((k) => t.includes(k.toLowerCase()))) return rule.tag
  }
  return '综合共性问题'
}

/** Top N 班级共性薄弱点（仅标签 + 次数 + 占比，不含原文） */
export function aggregateClassWeakTags(hints, limit = 5) {
  const map = new Map()
  const total = (hints || []).filter((h) => String(h || '').trim()).length || 1
  for (const raw of hints || []) {
    const full = String(raw || '').trim()
    if (!full) continue
    const tag = inferStudentWeakTag(full)
    map.set(tag, (map.get(tag) || 0) + 1)
  }
  return [...map.entries()]
    .map(([tag, count]) => ({
      tag,
      count,
      pct: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function isSmallSample(overview) {
  return Number(overview?.studentCount) > 0 && Number(overview.studentCount) < SMALL_SAMPLE_THRESHOLD
}

export function formatPct(numerator, denominator) {
  const d = Number(denominator) || 0
  const n = Number(numerator) || 0
  if (d <= 0) return '—'
  return `${Math.min(100, Math.round((n / d) * 100))}%`
}

export function computePersonalInScope(archiveRows, taskIdsInScope) {
  const scopeSet = new Set(taskIdsInScope)
  const rows = (archiveRows || []).filter((r) => scopeSet.has(Number(r.task_id)))
  const submittedTaskIds = new Set(rows.map((r) => Number(r.task_id)))
  const scores = rows.map(pickArchiveScore).filter((s) => s != null)
  const myAvg =
    scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null

  let needImprove = 0
  for (const tid of taskIdsInScope) {
    const row = rows.find((r) => Number(r.task_id) === Number(tid))
    if (!row) {
      needImprove += 1
      continue
    }
    const sc = pickArchiveScore(row)
    if (sc != null && sc < 60) needImprove += 1
  }

  return {
    mySubmitted: submittedTaskIds.size,
    myAvg,
    needImprove,
    myScores: scores,
  }
}

export function scoreBucketForValue(score) {
  if (score == null || !Number.isFinite(Number(score))) return null
  const s = Number(score)
  if (s >= 90) return '90+'
  if (s >= 80) return '80-89'
  if (s >= 70) return '70-79'
  if (s >= 60) return '60-69'
  return '<60'
}

export function buildStudentKpis(overview, personal) {
  const o = overview || {}
  const studentCount = Number(o.studentCount) || 0
  const taskCount = Number(o.taskCount) || 0
  const submissionCount = Number(o.submissionCount) || 0
  const gradedCount = Number(o.gradedCount) || 0
  const expected = studentCount * taskCount

  return [
    {
      key: 'my-sub',
      label: '我的已提交任务',
      value: personal?.mySubmitted != null ? personal.mySubmitted : '—',
      tone: 'cyan',
    },
    {
      key: 'my-avg',
      label: '我的平均分',
      value: personal?.myAvg != null ? Number(personal.myAvg).toFixed(1) : '—',
      tone: 'blue',
    },
    {
      key: 'class-avg',
      label: '班级平均分',
      value: o.avgScore != null ? Number(o.avgScore).toFixed(1) : '—',
      tone: 'blue',
    },
    {
      key: 'sub-rate',
      label: '班级提交完成率',
      value: formatPct(submissionCount, expected),
      tone: 'green',
    },
    {
      key: 'grade-rate',
      label: '班级批改完成率',
      value: formatPct(gradedCount, expected),
      tone: 'green',
    },
    {
      key: 'improve',
      label: '待提升任务数',
      value: personal?.needImprove != null ? personal.needImprove : '—',
      tone: personal?.needImprove > 0 ? 'orange' : 'muted',
    },
  ]
}

export function buildClassOverviewItems(overview) {
  const o = overview || {}
  return [
    { label: '班级任务数', value: o.taskCount ?? '—' },
    { label: '班级提交数', value: o.submissionCount ?? '—' },
    { label: '班级已批改数', value: o.gradedCount ?? '—' },
    {
      label: '班级平均分',
      value: o.avgScore != null ? Number(o.avgScore).toFixed(1) : '—',
    },
  ]
}

export function buildLearningSuggestions({ myAvg, classAvg, weakTags, smallSample }) {
  const tips = []
  const tags = (weakTags || []).map((t) => t.tag)

  if (!smallSample && myAvg != null && classAvg != null && myAvg < classAvg) {
    tips.push('你的平均分低于班级平均，建议优先查看低分任务的批改报告，对照薄弱项改进。')
  }

  const hasDoc = tags.some((t) => /文档|材料|提交/.test(t))
  const hasCode = tags.some((t) => /规范|异常|运行/.test(t))
  const hasUi = tags.some((t) => /页面|组件/.test(t))

  if (hasDoc) {
    tips.push('班级共性提示：注意补充 README、运行截图与提交说明，避免材料不完整。')
  }
  if (hasCode) {
    tips.push('班级共性提示：提交前检查命名、注释与异常处理，减少低级失分。')
  }
  if (hasUi) {
    tips.push('班级共性提示：页面与组件实现要完整，建议对照任务要求逐项自检。')
  }
  if (tags.some((t) => /运行|结果/.test(t))) {
    tips.push('班级共性提示：建议本地运行通过后保留截图或日志，便于自查与说明。')
  }

  if (smallSample) {
    tips.push('当前班级有效样本较少，以下建议为通用学习方向，具体以教师要求为准。')
  }

  if (!tips.length) {
    tips.push('保持当前学习节奏，遇到疑问可通过 AI 答疑助手或查看实训档案复盘。')
  }

  return tips.slice(0, 4)
}

export const STUDENT_BS_NAV_LINKS = [
  { label: '查看成绩查询', path: '/student/results' },
  { label: '查看实训档案', path: '/student/archive' },
  { label: '前往在线实训', path: '/student/online-practice' },
  { label: '询问 AI 答疑助手', path: '/student/assistant' },
]

export function formatUpdatedAt(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
