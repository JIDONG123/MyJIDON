import { aggregateWeakHints } from './bigScreenData'
import { pickRadarAxisScale } from './echartsRadar'

const TEACHING_ADVICE = {
  代码规范: '建议在课堂中强调命名、注释与格式规范，提供示范代码对照讲解。',
  功能实现: '建议增加分步演示与课堂练习，强化核心逻辑与需求拆解训练。',
  页面实现: '建议补充前端布局与样式案例，安排 UI 还原与组件化小练习。',
  提交规范: '建议在任务说明中明确提交格式与命名规则，并进行一次集中演示。',
  测试覆盖: '建议讲解边界用例设计方法，布置最小测试集编写任务。',
  文档说明: '建议提供报告/说明文档模板，并在批改中强调文档完整性。',
}

const DIM_KEYWORDS = {
  代码: ['代码', '规范', '命名', '注释'],
  功能: ['功能', '逻辑', '实现', '算法'],
  界面: ['页面', '界面', 'UI', '布局', '样式'],
  文档: ['文档', '说明', '报告'],
  测试: ['测试', '用例'],
}

function inferDimKeyword(name) {
  const n = String(name || '')
  for (const [key, words] of Object.entries(DIM_KEYWORDS)) {
    if (words.some((w) => n.includes(w))) return key
  }
  return null
}

function matchProblemForDim(dimName, samples) {
  const key = inferDimKeyword(dimName)
  if (!key) return ''
  for (const s of samples || []) {
    const text = String(s || '')
    if (DIM_KEYWORDS[key]?.some((w) => text.includes(w))) {
      return text.length > 64 ? `${text.slice(0, 64)}…` : text
    }
  }
  return (samples?.[0] || '').slice(0, 64) || '—'
}

export function buildWeakKpis(weakData) {
  const dims = weakData?.weakDimensions || []
  const samples = weakData?.problemSamples || []
  const sampleCount = dims.length ? Math.max(...dims.map((d) => Number(d.sample) || 0)) : 0
  const attentionCount = dims.filter((d) => (Number(d.lowRate) || 0) >= 50).length
  return {
    sampleCount,
    avgScore: null,
    weakDimCount: dims.length,
    problemCount: samples.length,
    attentionCount,
  }
}

export function buildDiagnosisSummary(weakData) {
  const dims = weakData?.weakDimensions || []
  if (!dims.length) {
    return {
      hasData: false,
      text: '当前班级样本较少或尚无批改记录，完成批改后将自动生成能力诊断。',
    }
  }
  const weakest = dims[0]
  const highRisk = dims.filter((d) => (Number(d.lowRate) || 0) >= 50)
  const advice = getTeachingAdvice(weakest.name)
  const parts = [
    `最薄弱维度：${weakest.name}（低分占比 ${weakest.lowRate}%）`,
    highRisk.length > 1
      ? `另有 ${highRisk.length - 1} 个维度低分占比较高，需持续关注`
      : null,
    `建议优先：${advice}`,
  ].filter(Boolean)
  return { hasData: true, text: parts.join('；') + '。' }
}

export function getTeachingAdvice(dimName) {
  const n = String(dimName || '')
  for (const [key, advice] of Object.entries(TEACHING_ADVICE)) {
    if (n.includes(key.slice(0, 2)) || key.includes(n.slice(0, 2))) return advice
  }
  if (n.includes('代码')) return TEACHING_ADVICE['代码规范']
  if (n.includes('功能') || n.includes('逻辑')) return TEACHING_ADVICE['功能实现']
  if (n.includes('页面') || n.includes('界面')) return TEACHING_ADVICE['页面实现']
  return '建议结合典型错例开展针对性讲评与课堂练习。'
}

export function buildProblemCards(problemSamples, limit = 5) {
  return aggregateWeakHints(problemSamples, limit).map((item) => ({
    tag: item.tag,
    desc: item.desc,
    count: item.count,
    suggestion: TEACHING_ADVICE[item.tag] || '建议课堂中结合错例进行针对性讲解。',
  }))
}

export function buildDimensionRows(weakData) {
  const dims = weakData?.weakDimensions || []
  const samples = weakData?.problemSamples || []
  return dims.map((d) => ({
    name: d.name,
    lowRate: Number(d.lowRate) || 0,
    sample: Number(d.sample) || 0,
    topProblem: matchProblemForDim(d.name, samples),
    advice: getTeachingAdvice(d.name),
  }))
}

export function buildRadarSeries(weakDimensions) {
  const dims = weakDimensions || []
  if (!dims.length) return { indicators: [], values: [], splitNumber: 5 }
  const values = dims.map((d) => Math.max(0, 100 - (Number(d.lowRate) || 0)))
  const { axisMax, splitNumber } = pickRadarAxisScale(100)
  const indicators = dims.map((d) => ({
    name: d.name.length > 8 ? `${d.name.slice(0, 8)}…` : d.name,
    max: axisMax,
  }))
  return { indicators, values, splitNumber }
}
