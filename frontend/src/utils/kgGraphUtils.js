import {
  ROLE_LIMITS,
  truncateLabel,
  legendKeyForType,
  colorForNodeType,
  symbolForNodeType,
  legendTypesForKey,
} from './kgTheme'
import { nodeTypeLabel, relationLabel } from './kgRelationLabels'

function cloneGraph(graph) {
  if (!graph) return { nodes: [], links: [], categories: [], viewMode: 'default' }
  return {
    ...graph,
    nodes: (graph.nodes || []).map((n) => ({ ...n, label: n.label ? { ...n.label } : undefined })),
    links: (graph.links || []).map((l) => ({ ...l, lineStyle: l.lineStyle ? { ...l.lineStyle } : undefined })),
    categories: (graph.categories || []).map((c) => ({ ...c })),
  }
}

function computeDegrees(nodes, links) {
  const deg = new Map(nodes.map((n) => [n.id, 0]))
  for (const e of links) {
    if (deg.has(e.source)) deg.set(e.source, deg.get(e.source) + 1)
    if (deg.has(e.target)) deg.set(e.target, deg.get(e.target) + 1)
  }
  return deg
}

function findIsolatedIds(nodes, links) {
  const connected = new Set()
  for (const e of links) {
    connected.add(e.source)
    connected.add(e.target)
  }
  return nodes.filter((n) => !connected.has(n.id)).map((n) => n.id)
}

function nodePriority(n, role, degrees, opts = {}) {
  const type = n.value || n.type
  const deg = degrees.get(n.id) || n.degree || 0
  let score = deg
  if (['course', 'administrative_class', 'teaching_class'].includes(type)) score += 1000
  if (type === 'student' && role === 'student') score += 2000
  if (type === 'task') score += 500
  if (type === 'weakness' || type === 'error') score += 300
  if (n.masteryRate != null && n.masteryRate < 0.4) score += 200
  if (opts.centerId && n.id === opts.centerId) score += 5000
  if (n.isHighRisk) score += 400
  if (opts.recentTaskIds?.has(n.id)) score += 350
  return score
}

function pickByType(nodes, type, limit, exclude = new Set()) {
  return nodes.filter((n) => (n.value || n.type) === type && !exclude.has(n.id)).slice(0, limit)
}

function makeAggregateNode(type, hiddenNodes, aggIndex) {
  const count = hiddenNodes.length
  const labels = {
    knowledge_point: '更多知识点',
    task: '更多任务',
    weakness: '更多薄弱点',
    error: '更多错误',
    student: '更多学生',
    course: '更多课程',
  }
  const prefix = labels[type] || '更多节点'
  return {
    id: `__agg_${type}_${aggIndex}__`,
    name: `${prefix} ${count} 个`,
    value: 'aggregate',
    aggregateType: type,
    isAggregate: true,
    hiddenIds: hiddenNodes.map((n) => n.id),
    hiddenNodes,
    symbol: 'roundRect',
    symbolSize: 32,
    category: hiddenNodes[0]?.category ?? 0,
    label: { show: true },
    itemStyle: {
      color: '#94A3B8',
      borderColor: '#CBD5E1',
      borderWidth: 1,
      borderRadius: 16,
    },
  }
}

/**
 * 默认视图：保留核心节点，超出阈值则聚合
 */
export function applyRoleDefaultView(rawGraph, role, options = {}) {
  const graph = cloneGraph(rawGraph)
  let nodes = graph.nodes || []
  let links = graph.links || []
  const limit = ROLE_LIMITS[role] || 80
  const forceIncludeIds = options.forceIncludeIds || new Set()

  if (nodes.length <= limit && !forceIncludeIds.size) {
    return { graph: { ...graph, nodes, links }, aggregated: false, hiddenCount: 0 }
  }

  const degrees = computeDegrees(nodes, links)
  const centerId =
    options.centerId ||
    nodes.find((n) => ['administrative_class', 'teaching_class', 'course'].includes(n.value || n.type))?.id ||
    nodes.find((n) => n.value === 'student')?.id

  const scored = nodes
    .filter((n) => !n.isAggregate)
    .map((n) => ({
      n,
      score: nodePriority(n, role, degrees, { ...options, centerId }),
    }))
    .sort((a, b) => b.score - a.score)

  const keep = new Set()
  const typeCaps = {
    admin: {
      course: 15,
      administrative_class: 10,
      teaching_class: 10,
      teacher: 8,
      task: 25,
      knowledge_point: 35,
      weakness: 12,
      error: 8,
      student: 0,
    },
    teacher: {
      administrative_class: 1,
      teaching_class: 1,
      student: 10,
      task: 12,
      knowledge_point: 22,
      weakness: 12,
      error: 8,
    },
    student: { student: 1, task: 8, knowledge_point: 12, weakness: 8, error: 6 },
  }
  const caps = typeCaps[role] || typeCaps.teacher

  for (const { n } of scored) {
    if (keep.size >= limit && !forceIncludeIds.has(n.id)) break
    const t = n.value || n.type
    const cap = caps[t]
    if (cap != null && !forceIncludeIds.has(n.id)) {
      const current = [...keep].filter((id) => {
        const node = nodes.find((x) => x.id === id)
        return (node?.value || node?.type) === t
      }).length
      if (current >= cap) continue
    }
    keep.add(n.id)
  }

  for (const id of forceIncludeIds) keep.add(id)

  if (centerId) keep.add(centerId)

  const hiddenByType = new Map()
  for (const n of nodes) {
    if (keep.has(n.id) || n.isAggregate) continue
    const t = n.value || n.type
    if (!hiddenByType.has(t)) hiddenByType.set(t, [])
    hiddenByType.get(t).push(n)
  }

  const aggNodes = []
  let aggIdx = 0
  for (const [type, hidden] of hiddenByType) {
    if (!hidden.length) continue
    if (hidden.length === 1) {
      keep.add(hidden[0].id)
      continue
    }
    aggNodes.push(makeAggregateNode(type, hidden, aggIdx++))
  }

  const keptNodes = nodes.filter((n) => keep.has(n.id))
  const finalNodes = [...keptNodes, ...aggNodes]
  const idSet = new Set(finalNodes.map((n) => n.id))
  const finalLinks = links.filter((e) => idSet.has(e.source) && idSet.has(e.target))

  for (const agg of aggNodes) {
    const hiddenSet = new Set(agg.hiddenIds)
    const related = new Set()
    for (const e of links) {
      if (hiddenSet.has(e.source) && idSet.has(e.target)) related.add(e.target)
      if (hiddenSet.has(e.target) && idSet.has(e.source)) related.add(e.source)
    }
    for (const rid of related) {
      finalLinks.push({
        source: agg.id,
        target: rid,
        value: 'AGGREGATE',
        lineStyle: { type: 'dashed', opacity: 0.35, width: 1 },
      })
    }
  }

  return {
    graph: { ...graph, nodes: finalNodes, links: finalLinks },
    aggregated: aggNodes.length > 0,
    hiddenCount: nodes.length - keptNodes.length,
  }
}

export function markCoreLabels(nodes, links, role, zoomLevel = 1) {
  const degrees = computeDegrees(nodes, links)
  const sorted = [...nodes].sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0))
  const coreCount = role === 'student' ? 8 : role === 'teacher' ? 12 : 18
  const coreIds = new Set(
    sorted
      .filter((n) => !n.isAggregate)
      .slice(0, coreCount)
      .map((n) => n.id)
  )
  for (const n of nodes) {
    const type = n.value || n.type
    const showCore =
      n.isAggregate ||
      coreIds.has(n.id) ||
      type === 'class' ||
      type === 'chapter' ||
      (type === 'student' && role === 'student') ||
      n.isHighRisk
    const showZoom = zoomLevel >= 1.35
    const show = showCore || showZoom
    n.label = {
      ...(n.label || {}),
      show,
      formatter: truncateLabel(n.name),
    }
    n.fullName = n.name
  }
  return nodes
}

export function applyNodeTheme(nodes, role) {
  return nodes.map((n) => {
    const type = n.isAggregate ? 'aggregate' : n.value || n.type
    const color = colorForNodeType(type, { isHighRisk: n.isHighRisk })
    const symbol = n.symbol || symbolForNodeType(type)
    return {
      ...n,
      symbol,
      itemStyle: {
        ...(n.itemStyle || {}),
        color,
        borderColor: n.itemStyle?.borderColor || color,
        borderWidth: n.itemStyle?.borderWidth || (type === 'mistake_point' ? 2 : 0),
      },
    }
  })
}

export function filterGraph(graph, filters = {}) {
  const g = cloneGraph(graph)
  let nodes = g.nodes || []
  let links = g.links || []

  if (filters.legendType) {
    // 图例高亮在 highlightLegend 中处理，此处不裁剪节点
  }

  if (filters.nodeTypes?.length) {
    const set = new Set(filters.nodeTypes)
    nodes = nodes.filter((n) => n.isAggregate || set.has(n.value || n.type))
  }

  if (filters.relationTypes?.length) {
    const set = new Set(filters.relationTypes)
    links = links.filter((e) => set.has(e.value))
  }

  if (filters.weakOnly) {
    const weakIds = new Set(
      nodes
        .filter((n) => ['weakness', 'error'].includes(n.value || n.type) || n.isHighRisk)
        .map((n) => n.id)
    )
    const related = new Set(weakIds)
    for (const e of links) {
      if (weakIds.has(e.source)) related.add(e.target)
      if (weakIds.has(e.target)) related.add(e.source)
    }
    nodes = nodes.filter((n) => related.has(n.id) || n.isAggregate)
  }

  if (filters.errorOnly) {
    const errorIds = new Set(
      nodes.filter((n) => (n.value || n.type) === 'error' || n.isHighRisk).map((n) => n.id)
    )
    const related = new Set(errorIds)
    for (const e of links) {
      if (errorIds.has(e.source)) related.add(e.target)
      if (errorIds.has(e.target)) related.add(e.source)
    }
    nodes = nodes.filter((n) => related.has(n.id) || n.isAggregate)
  }

  if (filters.isolatedOnly) {
    const connected = new Set()
    for (const e of links) {
      connected.add(e.source)
      connected.add(e.target)
    }
    nodes = nodes.filter((n) => !connected.has(n.id) || n.isAggregate)
  }

  if (filters.unlinkedKpOnly) {
    const tasks = new Set(nodes.filter((n) => (n.value || n.type) === 'task').map((n) => n.id))
    const linkedKps = new Set()
    for (const e of links) {
      if (tasks.has(e.source) || tasks.has(e.target)) {
        linkedKps.add(e.source)
        linkedKps.add(e.target)
      }
    }
    const orphanKpIds = new Set(
      nodes
        .filter((n) => (n.value || n.type) === 'knowledge_point' && !linkedKps.has(n.id))
        .map((n) => n.id)
    )
    const related = new Set(orphanKpIds)
    for (const e of links) {
      if (orphanKpIds.has(e.source)) related.add(e.target)
      if (orphanKpIds.has(e.target)) related.add(e.source)
    }
    nodes = nodes.filter((n) => related.has(n.id) || n.isAggregate)
  }

  if (filters.focusPathId) {
    const center = filters.focusPathId
    const related = new Set([center])
    for (const e of links) {
      if (e.source === center) related.add(e.target)
      if (e.target === center) related.add(e.source)
    }
    nodes = nodes.filter((n) => related.has(n.id) || n.isAggregate)
  }

  if (filters.recentTasksOnly) {
    const taskNodes = nodes.filter((n) => (n.value || n.type) === 'task')
    const recent = taskNodes.slice(0, 8).map((n) => n.id)
    const related = new Set(recent)
    for (const e of links) {
      if (recent.includes(e.source)) related.add(e.target)
      if (recent.includes(e.target)) related.add(e.source)
    }
    nodes = nodes.filter((n) => related.has(n.id) || n.isAggregate)
  }

  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase()
    const matched = new Set(
      nodes.filter((n) => String(n.name || '').toLowerCase().includes(q)).map((n) => n.id)
    )
    if (matched.size) {
      const related = new Set(matched)
      for (const e of links) {
        if (matched.has(e.source)) related.add(e.target)
        if (matched.has(e.target)) related.add(e.source)
      }
      nodes = nodes.filter((n) => related.has(n.id) || n.isAggregate)
    }
  }

  if (filters.hideStudents && filters.selfStudentId) {
    nodes = nodes.filter(
      (n) => (n.value || n.type) !== 'student' || n.id === filters.selfStudentId
    )
  }

  const idSet = new Set(nodes.map((n) => n.id))
  links = links.filter((e) => idSet.has(e.source) && idSet.has(e.target))

  return { ...g, nodes, links }
}

export function dedupeNodesForSearch(nodes) {
  const byKey = new Map();
  for (const n of nodes) {
    if (n.isAggregate) continue;
    const type = n.value || n.type;
    const name = String(n.displayName || n.name || '').trim();
    let key = `${type}:${n.id}`;
    if (type === 'task') {
      const sid = n.source_id || (String(n.id).match(/^task_(\d+)$/) || [])[1];
      key = sid ? `task:src:${sid}` : `task:name:${name}`;
    }
    const prev = byKey.get(key);
    if (!prev || taskPickScore(n) > taskPickScore(prev)) {
      byKey.set(key, n);
    }
  }
  return [...byKey.values()];
}

function taskPickScore(n) {
  let s = 0;
  if (n.source_id) s += 100;
  if (/^task_\d+$/.test(String(n.id))) s += 50;
  return s;
}

export function searchNodes(graph, query, role, selfStudentId) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []
  const pool = dedupeNodesForSearch(graph.nodes || [])
  return pool
    .filter((n) => {
      if (role === 'student' && (n.value || n.type) === 'student' && n.id !== selfStudentId) return false
      return String(n.name || n.displayName || '').toLowerCase().includes(q)
    })
    .slice(0, 20)
    .map((n) => ({
      id: n.id,
      name: formatSearchNodeLabel(n),
      type: n.value || n.type,
    }))
}

function formatSearchNodeLabel(n) {
  const name = n.displayName || n.name || n.id
  const type = n.value || n.type
  if (type !== 'task') return name
  const sid = n.source_id || (String(n.id).match(/^task_(\d+)$/) || [])[1]
  return sid ? `${name} (#${sid})` : name
}

export function computeRoleStats(rawGraph, apiStats, role) {
  const nodes = rawGraph?.nodes || []
  const links = rawGraph?.links || []
  const degrees = computeDegrees(nodes, links)
  const isolated = findIsolatedIds(nodes, links)

  const countByType = (type) => nodes.filter((n) => (n.value || n.type) === type).length

  const base = {
    nodeCount: nodes.length,
    edgeCount: links.length,
    isolatedCount: isolated.length,
    courseCount: countByType('course'),
    adminClassCount: countByType('administrative_class'),
    teachingClassCount: countByType('teaching_class'),
    taskCount: countByType('task'),
    kpCount: countByType('knowledge_point'),
    weakCount: countByType('weakness'),
    errorCount: countByType('error'),
    studentCount: countByType('student'),
    teacherCount: countByType('teacher'),
  }

  if (role === 'admin') {
    return {
      cards: [
        { key: 'course', label: '课程/章节', value: base.courseCount + countByType('chapter'), icon: '📘' },
        { key: 'task', label: '任务数', value: base.taskCount || apiStats?.taskCount, icon: '📝' },
        { key: 'kp', label: '知识点数', value: base.kpCount, icon: '🔗' },
        { key: 'edge', label: '关系数', value: base.edgeCount, icon: '↔' },
        { key: 'isolated', label: '孤立节点', value: base.isolatedCount, warn: base.isolatedCount > 0, icon: '⚠' },
        { key: 'total', label: '节点总量', value: apiStats?.nodeCount ?? base.nodeCount, icon: '◎' },
      ],
      qualityAlerts: buildQualityAlerts(nodes, links, isolated, apiStats),
    }
  }

  if (role === 'teacher') {
    const weakKps = nodes.filter(
      (n) =>
        (n.value || n.type) === 'knowledge_point' &&
        n.masteryRate != null &&
        n.masteryRate < 0.6
    ).length
    const weakNodes = countByType('weakness') + countByType('error')
    return {
      cards: [
        { key: 'task', label: '本班任务', value: apiStats?.taskCount ?? base.taskCount, icon: '📝' },
        { key: 'kp', label: '知识点', value: base.kpCount, icon: '🔗' },
        { key: 'weak', label: '薄弱点', value: weakKps || countByType('weakness'), warn: true, icon: '△' },
        { key: 'error', label: '高频错误', value: base.errorCount || weakNodes, warn: base.errorCount > 0, icon: '!' },
        { key: 'student', label: '参与学生', value: base.studentCount, icon: '👤' },
        { key: 'edge', label: '关系数', value: base.edgeCount, icon: '↔' },
      ],
      teachingAdvice: buildTeachingAdvice(nodes, links),
    }
  }

  const mastered = nodes.filter(
    (n) => (n.value || n.type) === 'knowledge_point' && n.masteryRate != null && n.masteryRate >= 0.7
  ).length
  const weak = nodes.filter(
    (n) =>
      (n.value || n.type) === 'knowledge_point' &&
      n.masteryRate != null &&
      n.masteryRate < 0.5
  ).length
  const tasks = countByType('task')
  const taskScores = nodes.filter((n) => (n.value || n.type) === 'task' && n.masteryRate != null)
  const avgScore = taskScores.length
    ? taskScores.reduce((a, n) => a + n.masteryRate, 0) / taskScores.length
    : null

  return {
    cards: [
      { key: 'task', label: '已完成任务', value: tasks, icon: '📝' },
      { key: 'mastered', label: '掌握知识点', value: mastered || apiStats?.masteredCount, icon: '✓' },
      { key: 'weak', label: '待提升知识点', value: weak || apiStats?.weakCount, warn: true, icon: '△' },
      { key: 'score', label: '最近得分', value: avgScore != null ? `${(avgScore * 100).toFixed(0)}` : '—', icon: '★' },
      { key: 'weakness', label: '薄弱点', value: countByType('weakness') + countByType('error'), warn: true, icon: '!' },
      { key: 'edge', label: '关系数', value: base.edgeCount, icon: '↔' },
    ],
    learningAdvice: buildLearningAdvice(nodes, links),
  }
}

function buildQualityAlerts(nodes, links, isolated, apiStats) {
  const alerts = []
  if (isolated.length) alerts.push({ type: 'warning', text: `存在 ${isolated.length} 个孤立节点，建议补充关联` })
  const tasks = new Set(nodes.filter((n) => (n.value || n.type) === 'task').map((n) => n.id))
  const linkedKps = new Set()
  for (const e of links) {
    if (tasks.has(e.source) || tasks.has(e.target)) {
      linkedKps.add(e.source)
      linkedKps.add(e.target)
    }
  }
  const orphanKps = nodes.filter(
    (n) => (n.value || n.type) === 'knowledge_point' && !linkedKps.has(n.id)
  ).length
  if (orphanKps) alerts.push({ type: 'info', text: `${orphanKps} 个知识点尚未关联任务` })
  if (apiStats?.layoutHint?.includes('力导向')) {
    alerts.push({ type: 'info', text: '节点较多，已启用力导向总览布局' })
  }
  if (!alerts.length) alerts.push({ type: 'success', text: '图谱结构正常，可继续监管课程资源建设' })
  return alerts
}

function buildTeachingAdvice(nodes, links) {
  const weakKps = nodes
    .filter(
      (n) =>
        (n.value || n.type) === 'knowledge_point' &&
        n.masteryRate != null &&
        n.masteryRate < 0.55
    )
    .sort((a, b) => (a.masteryRate ?? 1) - (b.masteryRate ?? 1))
    .slice(0, 5)
    .map((n) => n.name)

  const mistakes = nodes
    .filter((n) => ['weakness', 'error'].includes(n.value || n.type))
    .slice(0, 5)
    .map((n) => n.name)

  const lowTasks = nodes
    .filter((n) => (n.value || n.type) === 'task' && n.masteryRate != null && n.masteryRate < 0.6)
    .slice(0, 3)
    .map((n) => n.name)

  return {
    reviewKps: weakKps,
    extraPractice: lowTasks,
    mistakeSummary: mistakes,
    tierHint: weakKps.length ? '建议关注掌握率偏低的知识点并分层辅导' : '本班整体掌握情况良好',
  }
}

function buildLearningAdvice(nodes, links) {
  const review = nodes
    .filter(
      (n) =>
        (n.value || n.type) === 'knowledge_point' &&
        n.masteryRate != null &&
        n.masteryRate < 0.55
    )
    .slice(0, 5)
    .map((n) => n.name)

  const mastered = nodes
    .filter(
      (n) =>
        (n.value || n.type) === 'knowledge_point' &&
        n.masteryRate != null &&
        n.masteryRate >= 0.75
    )
    .slice(0, 5)
    .map((n) => n.name)

  const recentWeak = nodes
    .filter((n) => ['weakness', 'error'].includes(n.value || n.type))
    .slice(0, 4)
    .map((n) => n.name)

  return {
    priorityReview: review,
    recommendedPractice: nodes
      .filter((n) => (n.value || n.type) === 'task' && n.masteryRate != null && n.masteryRate < 0.65)
      .slice(0, 3)
      .map((n) => n.name),
    recentWeak,
    mastered,
  }
}

export function getNodeDetail(node, graph, role) {
  if (!node) return null
  const type = node.value || node.type
  const links = graph?.links || []
  const nodes = graph?.nodes || []
  const neighbors = []
  for (const e of links) {
    if (e.source === node.id) {
      const t = nodes.find((n) => n.id === e.target)
      if (t) neighbors.push({ ...t, relation: e.value })
    }
    if (e.target === node.id) {
      const t = nodes.find((n) => n.id === e.source)
      if (t) neighbors.push({ ...t, relation: e.value })
    }
  }

  const detail = {
    id: node.id,
    name: node.displayName || node.name,
    type: node.typeLabel || nodeTypeLabel(type),
    rawType: type,
    typeLabel: legendKeyForType(type),
    masteryRate: node.masteryRate,
    degree: node.degree,
    neighbors: neighbors.slice(0, 12).map((nb) => ({
      ...nb,
      name: nb.displayName || nb.name,
      relation: relationLabel(nb.relation),
    })),
    metrics: [{ label: '关系数', value: neighbors.length }],
    actions: [],
  }

  if (type === 'knowledge_point') {
    detail.metrics = [
      { label: '掌握率', value: node.masteryRate != null ? `${(node.masteryRate * 100).toFixed(0)}%` : '—' },
      { label: '关联任务', value: neighbors.filter((n) => (n.value || n.type) === 'task').length },
      { label: '出现次数', value: node.degree ?? neighbors.length },
    ]
    if (role === 'teacher') detail.suggestion = node.masteryRate != null && node.masteryRate < 0.6 ? '建议复讲' : '掌握良好'
    if (role === 'student') detail.suggestion = node.masteryRate != null && node.masteryRate < 0.5 ? '推荐复习' : '已掌握'
  } else if (type === 'task') {
    detail.metrics = [
      { label: '均分/得分', value: node.masteryRate != null ? `${(node.masteryRate * 100).toFixed(0)}` : '—' },
      { label: '关联知识点', value: neighbors.filter((n) => (n.value || n.type) === 'knowledge_point').length },
    ]
  } else if (type === 'exercise') {
    detail.metrics = [
      { label: '类型', value: '习题' },
      { label: '关联知识点', value: neighbors.filter((n) => (n.value || n.type) === 'knowledge_point').length },
    ]
  } else if (type === 'weakness' || type === 'error') {
    detail.metrics = [
      { label: '出现次数', value: node.mistakeFreq ?? neighbors.length },
      { label: '关联任务', value: neighbors.filter((n) => (n.value || n.type) === 'task').length },
    ]
    detail.suggestion = '建议针对性练习与错题回顾'
  } else if (type === 'administrative_class' || type === 'teaching_class') {
    detail.metrics = [
      { label: '班级类型', value: type === 'administrative_class' ? '行政班' : '教学班' },
      { label: '学生数', value: neighbors.filter((n) => (n.value || n.type) === 'student').length },
      { label: '任务数', value: neighbors.filter((n) => (n.value || n.type) === 'task').length },
    ]
  } else if (type === 'course' || type === 'chapter') {
    detail.metrics = [
      { label: '关联任务', value: neighbors.filter((n) => (n.value || n.type) === 'task').length },
      { label: '关联知识点', value: neighbors.filter((n) => (n.value || n.type) === 'knowledge_point').length },
    ]
  } else if (type === 'student') {
    detail.metrics = [
      { label: '完成任务', value: neighbors.filter((n) => (n.value || n.type) === 'task').length },
      { label: '掌握率', value: node.masteryRate != null ? `${(node.masteryRate * 100).toFixed(0)}%` : '—' },
    ]
  } else if (type === 'teacher') {
    detail.metrics = [{ label: '关联任务', value: neighbors.filter((n) => (n.value || n.type) === 'task').length }]
  }

  if (node.isAggregate) {
    detail.metrics = [{ label: '聚合数量', value: node.hiddenIds?.length ?? 0 }]
    detail.suggestion = '点击展开查看隐藏节点'
  }

  return detail
}

export function graphBoundsFromNodes(nodes) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let count = 0
  for (const n of nodes) {
    if (n.x == null || n.y == null) continue
    const half = Math.max(12, (n.symbolSize || 24) / 2)
    minX = Math.min(minX, n.x - half)
    minY = Math.min(minY, n.y - half)
    maxX = Math.max(maxX, n.x + half)
    maxY = Math.max(maxY, n.y + half)
    count += 1
  }
  if (!count) return null
  return { minX, minY, maxX, maxY }
}

export function centerNodeCoordinates(nodes, targetX = 0, targetY = 0) {
  const bounds = graphBoundsFromNodes(nodes)
  if (!bounds) return nodes
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  const dx = targetX - cx
  const dy = targetY - cy
  for (const n of nodes) {
    if (n.x != null) n.x += dx
    if (n.y != null) n.y += dy
  }
  return nodes
}

export function assignCircularLayout(nodes, centerId) {
  const center = nodes.find((n) => n.id === centerId) || nodes[0]
  if (!center) return nodes
  const others = nodes.filter((n) => n.id !== center.id)
  const cx = 0
  const cy = 0
  center.x = cx
  center.y = cy
  center.fixed = true
  const rings = [[], [], []]
  others.forEach((n) => {
    const t = n.value || n.type
    if (t === 'task') rings[0].push(n)
    else if (t === 'knowledge_point') rings[1].push(n)
    else rings[2].push(n)
  })
  const radii = [120, 220, 320]
  rings.forEach((ring, ri) => {
    ring.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(ring.length, 1)
      n.x = cx + radii[ri] * Math.cos(angle)
      n.y = cy + radii[ri] * Math.sin(angle)
      n.fixed = true
    })
  })
  return nodes
}

export function assignLayeredLayout(nodes, links) {
  const tiers = { class: 0, chapter: 0, task: 1, knowledge_point: 2, mistake_point: 3, student: 1, exercise: 2 }
  const byTier = new Map()
  for (const n of nodes) {
    const t = tiers[n.value || n.type] ?? 2
    if (!byTier.has(t)) byTier.set(t, [])
    byTier.get(t).push(n)
  }
  let y = 0
  for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
    const list = byTier.get(tier)
    const cols = Math.max(1, Math.ceil(Math.sqrt(list.length * 1.5)))
    list.forEach((n, i) => {
      n.x = (i % cols - (cols - 1) / 2) * 130
      n.y = y + Math.floor(i / cols) * 90
      n.fixed = true
    })
    y += Math.ceil(list.length / cols) * 90 + 80
  }
  return nodes
}

export function highlightLegend(graph, legendKey) {
  const g = cloneGraph(graph)
  if (!legendKey) return g
  const types = legendTypesForKey(legendKey)
  const matched = new Set(
    g.nodes
      .filter((n) => {
        if (n.isAggregate) return false
        const t = n.value || n.type
        return types.includes(t) || (legendKey === 'error' && n.isHighRisk)
      })
      .map((n) => n.id)
  )
  const related = new Set(matched)
  for (const e of g.links) {
    if (matched.has(e.source)) related.add(e.target)
    if (matched.has(e.target)) related.add(e.source)
  }
  g.nodes = g.nodes.map((n) => ({
    ...n,
    itemStyle: {
      ...(n.itemStyle || {}),
      opacity: related.has(n.id) || n.isAggregate ? 1 : 0.22,
    },
  }))
  g.links = g.links.map((e) => ({
    ...e,
    lineStyle: {
      ...(e.lineStyle || {}),
      opacity: related.has(e.source) && related.has(e.target) ? 0.75 : 0.1,
    },
  }))
  return g
}

export function highlightSelection(graph, selectedId) {
  const g = cloneGraph(graph)
  if (!selectedId) return g
  const related = new Set([selectedId])
  for (const e of g.links) {
    if (e.source === selectedId) related.add(e.target)
    if (e.target === selectedId) related.add(e.source)
  }
  g.nodes = g.nodes.map((n) => ({
    ...n,
    itemStyle: {
      ...(n.itemStyle || {}),
      opacity: related.has(n.id) ? 1 : 0.25,
    },
  }))
  g.links = g.links.map((e) => ({
    ...e,
    lineStyle: {
      ...(e.lineStyle || {}),
      opacity: e.source === selectedId || e.target === selectedId ? 0.9 : 0.12,
      width: e.source === selectedId || e.target === selectedId ? 2.5 : 0.8,
    },
  }))
  return g
}

export function assignSmartLayout(nodes, links, role) {
  const tiers = {
    course: 0,
    administrative_class: 0,
    teaching_class: 0,
    teacher: 0,
    student: role === 'student' ? 0 : 1,
    task: role === 'student' ? 1 : 2,
    knowledge_point: 3,
    weakness: 4,
    error: 4,
    aggregate: 4,
  }
  const byTier = new Map()
  for (const n of nodes) {
    const t = n.value || n.type
    const tier = tiers[t] ?? 3
    if (!byTier.has(tier)) byTier.set(tier, [])
    byTier.get(tier).push(n)
  }
  let y = 0
  for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
    const list = byTier.get(tier)
    const cols = Math.max(1, Math.ceil(Math.sqrt(list.length * 1.4)))
    list.forEach((n, i) => {
      n.x = (i % cols - (cols - 1) / 2) * 140
      n.y = y + Math.floor(i / cols) * 95
      n.fixed = true
    })
    y += Math.ceil(list.length / cols) * 95 + 90
  }
  return nodes
}

export { cloneGraph, computeDegrees, findIsolatedIds }
