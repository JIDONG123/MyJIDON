const QUESTION_TYPE_RULES = [
  { type: '概念理解', keys: ['什么是', '为什么', '解释', '含义', '区别', '原理', '定义'] },
  { type: '操作指南', keys: ['怎么', '如何', '步骤', '怎样', '方法', '教程'] },
  { type: '代码调试', keys: ['报错', '错误', '异常', 'bug', '调试', '运行', '编译', '无法'] },
  { type: '作业任务', keys: ['作业', '任务', '提交', '截止', '要求', '题目'] },
  { type: '成绩评语', keys: ['分数', '成绩', '批改', '评分', '扣分'] },
  { type: '工具环境', keys: ['安装', '配置', '环境', '软件', 'IDE', 'vscode'] },
]

export function inferQuestionType(text) {
  const t = String(text || '')
  for (const rule of QUESTION_TYPE_RULES) {
    if (rule.keys.some((k) => t.includes(k))) return rule.type
  }
  return '其他咨询'
}

export function enrichAssistantRows(topQuestions) {
  return (topQuestions || []).map((row, idx) => ({
    rank: idx + 1,
    text: row.text || '',
    count: Number(row.count) || 0,
    type: inferQuestionType(row.text),
  }))
}

export function buildAssistantKpis(rows) {
  const list = rows || []
  const totalQuestions = list.reduce((s, r) => s + (Number(r.count) || 0), 0)
  const uniqueQuestions = list.length
  const topHot = list.length ? Math.max(...list.map((r) => Number(r.count) || 0)) : 0
  return {
    totalQuestions,
    uniqueQuestions,
    participatingStudents: null,
    topHotCount: topHot,
  }
}

export function buildQuestionTypeStats(rows) {
  const map = new Map()
  for (const row of rows || []) {
    const type = inferQuestionType(row.text)
    map.set(type, (map.get(type) || 0) + (Number(row.count) || 0))
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

export function buildTopQuestionBars(rows, limit = 8) {
  return [...(rows || [])]
    .sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0))
    .slice(0, limit)
    .map((r) => ({
      name: String(r.text || '').length > 28 ? `${String(r.text).slice(0, 28)}…` : r.text,
      fullText: r.text,
      value: Number(r.count) || 0,
    }))
}
