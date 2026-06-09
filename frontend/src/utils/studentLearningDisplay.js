/**
 * 学生端「个人学情画像」展示与前端聚合（不改后端）
 */

import { pickArchiveScore } from './studentArchiveDisplay'

const STANDARD_DIMENSIONS = [
  '功能完整性',
  '代码规范',
  '文档交付',
  '创新扩展',
  '运行验证',
  '提交规范',
]

const DIMENSION_KEYWORDS = {
  功能完整性: ['功能', '完整', '实现', '需求', '逻辑', '业务', '模块', '接口'],
  代码规范: ['规范', '命名', '注释', '代码', '可读', 'lint', '风格', '缩进'],
  文档交付: ['文档', 'readme', '说明', '报告', '交付', '描述'],
  创新扩展: ['创新', '扩展', '额外', '加分', '亮点'],
  运行验证: ['运行', '测试', '调试', '异常', '报错', '验证', '执行'],
  提交规范: ['提交', '压缩', '文件', '目录', '结构', '格式', '附件', '材料'],
}

const PROBLEM_TAG_KEYWORDS = [
  { tag: '异常处理', keys: ['异常', '错误', '报错', 'try', 'catch', '崩溃'] },
  { tag: '页面实现', keys: ['页面', 'ui', '界面', '前端', '布局', '样式'] },
  { tag: '文档交付', keys: ['文档', 'readme', '说明', '报告'] },
  { tag: '提交规范', keys: ['提交', '文件', '目录', '压缩', '结构', '材料'] },
  { tag: '代码规范', keys: ['规范', '命名', '注释', '可读', 'lint'] },
  { tag: '功能实现', keys: ['功能', '实现', '逻辑', '需求', '完整'] },
]

function normalizeText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstSentence(text, max = 48) {
  const s = normalizeText(text)
  if (!s) return '待确认问题'
  const cut = s.split(/[。！？；\n]/)[0].trim()
  const base = cut || s
  return base.length <= max ? base : `${base.slice(0, max)}…`
}

export function classifyProblemTag(text) {
  const s = normalizeText(text).toLowerCase()
  for (const item of PROBLEM_TAG_KEYWORDS) {
    if (item.keys.some((k) => s.includes(k.toLowerCase()))) return item.tag
  }
  return '功能实现'
}

function matchDimensionHits(text) {
  const s = normalizeText(text).toLowerCase()
  const hits = []
  for (const dim of STANDARD_DIMENSIONS) {
    const keys = DIMENSION_KEYWORDS[dim] || []
    if (keys.some((k) => s.includes(k.toLowerCase()))) hits.push(dim)
  }
  return hits.length ? hits : ['功能完整性']
}

function dimensionLevel(score) {
  if (score >= 85) return { key: 'strong', label: '优势', tone: 'success' }
  if (score >= 70) return { key: 'normal', label: '正常', tone: 'primary' }
  if (score >= 55) return { key: 'fair', label: '待提升', tone: 'warning' }
  return { key: 'poor', label: '需改进', tone: 'danger' }
}

function mapClassDimensionName(name) {
  const n = normalizeText(name)
  for (const dim of STANDARD_DIMENSIONS) {
    if (n.includes(dim) || dim.includes(n)) return dim
  }
  if (/功能|实现|完整/.test(n)) return '功能完整性'
  if (/规范|代码/.test(n)) return '代码规范'
  if (/文档|交付/.test(n)) return '文档交付'
  if (/创新|扩展/.test(n)) return '创新扩展'
  if (/运行|测试|验证/.test(n)) return '运行验证'
  if (/提交|材料/.test(n)) return '提交规范'
  return null
}

export function learningDiagnostic(avgScore) {
  if (avgScore == null || !Number.isFinite(Number(avgScore))) {
    return {
      tone: 'info',
      title: '综合诊断',
      text: '完成实训并通过批改后，系统将基于成绩与评价生成个人学情诊断摘要。',
    }
  }
  const n = Number(avgScore)
  if (n >= 90) {
    return {
      tone: 'success',
      title: '综合诊断',
      text: '整体表现优秀，请继续保持。',
    }
  }
  if (n >= 80) {
    return {
      tone: 'primary',
      title: '综合诊断',
      text: '整体表现良好，建议关注个别薄弱项。',
    }
  }
  if (n >= 60) {
    return {
      tone: 'warning',
      title: '综合诊断',
      text: '基础完成情况尚可，建议提升代码规范和功能完整性。',
    }
  }
  return {
    tone: 'danger',
    title: '综合诊断',
    text: '当前成绩偏低，建议优先查看低分任务报告并补强基础能力。',
  }
}

export function buildTopProblems(weakPoints = [], problemSamples = []) {
  const bucket = new Map()

  const add = (text, source = '') => {
    const body = normalizeText(text)
    if (!body) return
    const title = firstSentence(body, 42)
    const key = `${title}::${classifyProblemTag(body)}`
    const prev = bucket.get(key) || {
      title,
      tag: classifyProblemTag(body),
      count: 0,
      summary: body,
      source,
    }
    prev.count += 1
    if (body.length > prev.summary.length) prev.summary = body
    bucket.set(key, prev)
  }

  for (const item of weakPoints) {
    add(item.text, item.source)
  }
  for (const sample of problemSamples) {
    add(sample)
  }

  return [...bucket.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((item) => ({
      ...item,
      freqLabel: item.count > 1 ? `出现 ${item.count} 次` : '近期出现',
      summaryShort:
        item.summary.length > 120 ? `${item.summary.slice(0, 120)}…` : item.summary,
    }))
}

export function buildDimensionProfile(weakPoints = [], classWeakDimensions = []) {
  const hits = Object.fromEntries(STANDARD_DIMENSIONS.map((d) => [d, 0]))
  const classPenalty = Object.fromEntries(STANDARD_DIMENSIONS.map((d) => [d, 0]))

  for (const item of weakPoints) {
    for (const dim of matchDimensionHits(item.text)) {
      hits[dim] += 1
    }
  }

  for (const row of classWeakDimensions) {
    const mapped = mapClassDimensionName(row.name)
    if (mapped && row.lowRate >= 25) {
      classPenalty[mapped] = Math.max(classPenalty[mapped], Number(row.lowRate) || 0)
    }
  }

  return STANDARD_DIMENSIONS.map((name) => {
    const hit = hits[name] || 0
    const penalty = classPenalty[name] || 0
    let score = 88 - hit * 12 - Math.round(penalty * 0.15)
    score = Math.max(25, Math.min(98, score))
    const hasSignal = hit > 0 || penalty > 0
    return {
      name,
      score: hasSignal ? score : null,
      displayScore: hasSignal ? `${score} 分` : '—',
      rate: hasSignal ? score : null,
      level: hasSignal ? dimensionLevel(score) : { key: 'none', label: '—', tone: 'info' },
      hitCount: hit,
    }
  })
}

export function buildImprovementList(suggestions = [], weakPoints = []) {
  const seen = new Set()
  const list = []

  const push = (text) => {
    const s = normalizeText(text)
    if (!s || seen.has(s)) return
    seen.add(s)
    list.push(s.length > 160 ? `${s.slice(0, 160)}…` : s)
  }

  for (const item of suggestions) {
    push(item.text)
  }

  if (!list.length) {
    for (const item of weakPoints) {
      const tag = classifyProblemTag(item.text)
      if (tag === '文档交付') push('补充每次实训的运行截图和说明文档')
      else if (tag === '提交规范') push('检查提交文件是否与任务要求一致')
      else if (tag === '功能实现') push('优先完成核心功能，再补充扩展功能')
      else if (tag === '异常处理') push('重点复习异常处理和数据校验')
      else if (tag === '代码规范') push('提交前自查 README、目录结构和运行方式')
    }
  }

  if (!list.length) {
    const defaults = [
      '补充每次实训的运行截图和说明文档',
      '检查提交文件是否与任务要求一致',
      '优先完成核心功能，再补充扩展功能',
      '重点复习异常处理和数据校验',
      '提交前自查 README、目录结构和运行方式',
    ]
    for (const d of defaults) {
      push(d)
      if (list.length >= 6) break
    }
  }

  return list.slice(0, 6)
}

export function collectRecentScores(archiveItems = [], limit = 30) {
  const scores = []
  for (const row of archiveItems) {
    const s = pickArchiveScore(row)
    if (s == null || !Number.isFinite(s)) continue
    scores.push(s)
    if (scores.length >= limit) break
  }
  return scores
}

export function scoreStatsFromList(scores = []) {
  if (!scores.length) {
    return { max: null, min: null, count: 0 }
  }
  return {
    max: Math.max(...scores),
    min: Math.min(...scores),
    count: scores.length,
  }
}

export function formatLearningStatScore(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return Number(value).toFixed(digits)
}

export function buildRecentTrend(profile, recentScores = []) {
  const recentCount = Number(profile?.recentCount) || 0
  const avgScore = profile?.avgScore != null ? Number(profile.avgScore) : null
  const weakPoints = profile?.weakPoints || []
  const { max, min } = scoreStatsFromList(recentScores)

  const bySource = new Map()
  for (const item of weakPoints) {
    const src = normalizeText(item.source) || '近期任务'
    bySource.set(src, (bySource.get(src) || 0) + 1)
  }

  const taskIssues = [...bySource.entries()]
    .map(([name, issues]) => ({ name, issues }))
    .slice(0, 5)

  const maxScore = max
  const minScore = min

  let volatilityHint = ''
  if (recentCount >= 2 && avgScore != null) {
    if (maxScore != null && minScore != null && maxScore - minScore >= 15) {
      volatilityHint = `近期成绩波动较大（${minScore.toFixed(1)} ~ ${maxScore.toFixed(1)} 分），建议重点复盘低分任务。`
    } else {
      const issueRate = weakPoints.length / recentCount
      if (issueRate >= 0.6) {
        volatilityHint = '近期批改反馈中待改进项较多，建议优先处理高频问题。'
      } else if (issueRate <= 0.25) {
        volatilityHint = '近期表现相对稳定，可继续巩固优势项。'
      } else {
        volatilityHint = '近期表现存在波动，建议结合任务报告逐项改进。'
      }
    }
  }

  return {
    recentCount,
    avgScore,
    maxScore,
    minScore,
    recentScores: recentScores.slice(0, 5),
    taskIssues,
    volatilityHint,
    hasTrend: recentCount > 0 && avgScore != null,
  }
}

export function computeLearningSummary(profile, classWeak, recentScores = []) {
  const recentCount = Number(profile?.recentCount) || 0
  const avgScore = profile?.avgScore
  const weakPoints = profile?.weakPoints || []
  const suggestions = profile?.improvementSuggestions || []
  const classDims = classWeak?.weakDimensions || []

  const avgNum = avgScore != null ? Number(avgScore) : null
  const { max, min } = scoreStatsFromList(recentScores)

  const needImprove = new Set()
  for (const item of weakPoints) {
    if (item.source) needImprove.add(item.source)
  }

  const dimensions = buildDimensionProfile(weakPoints, classDims)
  const weakDimCount = dimensions.filter((d) => d.level.key === 'fair' || d.level.key === 'poor').length

  return {
    completed: recentCount,
    avgScore: avgNum != null && Number.isFinite(avgNum) ? avgNum.toFixed(1) : '—',
    maxScore: formatLearningStatScore(max),
    minScore: formatLearningStatScore(min),
    needImproveTasks: needImprove.size || (weakPoints.length ? weakPoints.length : 0),
    mainWeakPoints: weakDimCount || weakPoints.length || 0,
    hasData:
      recentCount > 0 ||
      weakPoints.length > 0 ||
      suggestions.length > 0 ||
      classDims.length > 0,
  }
}

export function radarSeriesFromDimensions(dimensions = []) {
  const withData = dimensions.filter((d) => d.rate != null)
  if (!withData.length) return []
  return withData.map((d) => ({
    name: d.name,
    maxScore: 100,
    score: d.rate,
  }))
}
