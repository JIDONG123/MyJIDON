/**
 * 图谱查询 → ECharts graph（班级掌握 / 课程任务 两套视图）
 */

const kgGraphStore = require('./kgGraphStore');
const pool = require('../config/database');
const {
  loadNodeMetaMap,
  normalizeNode,
  normalizeLink,
  categoriesForRole,
  relationLabel,
  dedupeGraphNodes,
  filterInvalidScopeNodes,
} = require('../utils/kgNodeNormalize');

const CLASS_CATEGORIES = ['班级', '学生', '实训任务', '知识点', '易错点'];
const COURSE_CATEGORIES = ['章节', '知识点', '实训任务', '习题'];
const STUDENT_CATEGORIES = ['我', '实训任务', '知识点', '易错点'];

const STUDENT_EDGE_TYPES = new Set([
  'MASTERED',
  'WEAK_IN',
  'MISTAKE_ON',
  'RELATES_TO',
  'CONTAINS',
  'HAS_KNOWLEDGE',
  'SUBMITTED',
  'GRADED',
]);

const CLASS_EDGE_SOLID = new Set([
  'ASSIGNED_TO',
  'CONTAINS',
  'MASTERED',
  'WEAK_IN',
  'MISTAKE_ON',
  'RELATES_TO',
  'HAS_KNOWLEDGE',
  'HAS_TASK',
  'BELONGS_TO',
  'SUBMITTED',
  'GRADED',
]);

const COURSE_EDGE_TYPES = new Set([
  'PREREQUISITE',
  'CONTAINS',
  'RELATES_TO',
  'SEMANTIC_SIMILAR',
  'SEMANTIC_RELATED',
  'HAS_KNOWLEDGE',
  'HAS_TASK',
  'BELONGS_TO',
]);

async function expandNodeIds(seedIds, depth = 2) {
  let frontier = [...new Set(seedIds.filter(Boolean))];
  const seen = new Set(frontier);
  const allEdges = [];
  for (let d = 0; d < depth; d++) {
    if (!frontier.length) break;
    const edges = await kgGraphStore.listEdges({
      fromIds: frontier,
      limit: 3000,
    });
    const backEdges = await kgGraphStore.listEdges({
      toIds: frontier,
      limit: 3000,
    });
    const batch = [...edges, ...backEdges];
    allEdges.push(...batch);
    const next = [];
    for (const e of batch) {
      if (!seen.has(e.from)) {
        seen.add(e.from);
        next.push(e.from);
      }
      if (!seen.has(e.to)) {
        seen.add(e.to);
        next.push(e.to);
      }
    }
    frontier = next;
  }
  return { nodeIds: [...seen], edges: allEdges };
}

async function getAdministrativeClassTaskIds(classId) {
  const [rows] = await pool.query(
    `SELECT id FROM tasks WHERE class_id = ? LIMIT 200`,
    [classId]
  );
  return rows.map((r) => Number(r.id));
}

async function getTeachingClassTaskIds(teachingClassId) {
  const [rows] = await pool.query(
    `SELECT id FROM tasks WHERE teaching_class_id = ? LIMIT 200`,
    [teachingClassId]
  );
  return rows.map((r) => Number(r.id));
}

/** @deprecated 使用 getAdministrativeClassTaskIds */
async function getClassTaskIds(classId) {
  return getAdministrativeClassTaskIds(classId);
}

async function applyGraphNormalization(graph, viewRole, options = {}) {
  if (!graph?.nodes?.length) return graph;
  const deduped = dedupeGraphNodes(graph.nodes, graph.links || []);
  graph.nodes = deduped.nodes;
  graph.links = deduped.links;
  const rawForMeta = graph.nodes.map((n) => ({
    id: n.id,
    type: n.rawType || n.value || n.type,
    name: n.name,
    source_id: n.source_id,
    meta: n.meta,
    mistakeFreq: n.mistakeFreq,
  }));
  const metaMap = await loadNodeMetaMap(rawForMeta);
  graph.nodes = graph.nodes.map((n) => {
    const normalized = normalizeNode(
      {
        id: n.id,
        type: n.rawType || n.value || n.type,
        name: n.name,
        source_id: n.source_id,
        meta: n.meta,
        mistakeFreq: n.mistakeFreq,
      },
      metaMap,
      viewRole,
      options
    );
    return {
      ...n,
      ...normalized,
      name: normalized.displayName,
      label: n.label || { show: false },
    };
  });
  graph.links = (graph.links || []).map((l) => {
    const nl = normalizeLink({ ...l, type: l.value || l.relationType });
    return {
      ...l,
      ...nl,
      value: nl.relationType,
      relationLabel: nl.relationLabel,
    };
  });
  graph.categories = categoriesForRole(viewRole);
  graph.relationTypes = [...new Set(graph.links.map((l) => l.relationType).filter(Boolean))];
  const filtered = filterInvalidScopeNodes(graph.nodes, graph.links || []);
  graph.nodes = filtered.nodes;
  graph.links = filtered.links;
  return graph;
}

async function fetchClassMasteryStats(classId) {
  const [rows] = await pool.query(
    `SELECT s.student_id, s.task_id, gr.total_score
     FROM submissions s
     JOIN grading_results gr ON gr.submission_id = s.id
     JOIN tasks t ON t.id = s.task_id
     WHERE t.class_id = ? AND gr.total_score IS NOT NULL`,
    [classId]
  );
  const studentScores = new Map();
  const taskScores = new Map();
  for (const r of rows) {
    const sc = Number(r.total_score);
    if (!Number.isFinite(sc)) continue;
    const sid = `student_${r.student_id}`;
    if (!studentScores.has(sid)) studentScores.set(sid, []);
    studentScores.get(sid).push(sc);
    const tid = `task_${r.task_id}`;
    if (!taskScores.has(tid)) taskScores.set(tid, []);
    taskScores.get(tid).push(sc);
  }
  const studentMastery = new Map();
  studentScores.forEach((arr, id) => {
    studentMastery.set(id, arr.reduce((a, b) => a + b, 0) / arr.length / 100);
  });
  const taskMastery = new Map();
  taskScores.forEach((arr, id) => {
    taskMastery.set(id, Math.min(1, arr.reduce((a, b) => a + b, 0) / arr.length / 100));
  });
  return { studentMastery, taskMastery };
}

function pickScopedMistakeIds(nodes, edges, scopeStudentIds, taskNodeIds, limit = 20) {
  if (!taskNodeIds.size) return new Set();

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const mistakeLinkedToScopedTask = new Set();
  for (const e of edges) {
    if (e.type !== 'RELATES_TO') continue;
    if (nodeMap.get(e.from)?.type === 'mistake_point' && taskNodeIds.has(e.to)) {
      mistakeLinkedToScopedTask.add(e.from);
    }
    if (nodeMap.get(e.to)?.type === 'mistake_point' && taskNodeIds.has(e.from)) {
      mistakeLinkedToScopedTask.add(e.to);
    }
  }

  const freq = new Map();
  for (const e of edges) {
    if (e.type !== 'MISTAKE_ON' && e.type !== 'WEAK_IN') continue;
    let mistakeId = null;
    if (scopeStudentIds.has(e.from) && nodeMap.get(e.to)?.type === 'mistake_point') {
      mistakeId = e.to;
    } else if (scopeStudentIds.has(e.to) && nodeMap.get(e.from)?.type === 'mistake_point') {
      mistakeId = e.from;
    }
    if (!mistakeId || !mistakeLinkedToScopedTask.has(mistakeId)) continue;
    freq.set(mistakeId, (freq.get(mistakeId) || 0) + 1);
  }

  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  for (const n of nodes) {
    if (n.type === 'mistake_point') {
      n.mistakeFreq = freq.get(n.id) || 0;
    }
  }
  return new Set(ranked.map(([id]) => id));
}

function computeDegrees(nodeIds, edges) {
  const deg = new Map(nodeIds.map((id) => [id, 0]));
  for (const e of edges) {
    if (deg.has(e.from)) deg.set(e.from, deg.get(e.from) + 1);
    if (deg.has(e.to)) deg.set(e.to, deg.get(e.to) + 1);
  }
  return deg;
}

const HIERARCHICAL_MAX_NODES = 48;
const HIERARCHICAL_MAX_PER_TIER = 16;

function pickCourseLayoutStyle(nodes) {
  if (!nodes.length) return 'force';
  if (nodes.length > HIERARCHICAL_MAX_NODES) return 'force';
  const tierCounts = {};
  const tierOf = { chapter: 0, knowledge_point: 1, task: 2, exercise: 3 };
  for (const n of nodes) {
    const t = tierOf[n.type] != null ? tierOf[n.type] : 1;
    tierCounts[t] = (tierCounts[t] || 0) + 1;
  }
  const maxInTier = Math.max(0, ...Object.values(tierCounts));
  if (maxInTier > HIERARCHICAL_MAX_PER_TIER) return 'force';
  return 'hierarchical';
}

/** 同层节点过多时按网格排布，避免挤成一条线 */
function assignHierarchicalPositions(nodes) {
  const tierKey = (n) => n.layoutTier ?? 1;
  const byTier = new Map();
  for (const n of nodes) {
    const t = tierKey(n);
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t).push(n);
  }
  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  let yOffset = 0;
  for (const tier of tiers) {
    const list = byTier.get(tier);
    const cols = Math.max(1, Math.ceil(Math.sqrt(list.length * 1.4)));
    const cellW = 130;
    const cellH = 88;
    const rows = Math.ceil(list.length / cols);
    list.forEach((n, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      n.x = (col - (cols - 1) / 2) * cellW;
      n.y = yOffset + row * cellH;
      n.fixed = true;
    });
    yOffset += rows * cellH + 70;
  }
}

function masteryToSize(rate, base = 28, spread = 32) {
  const r = rate != null && Number.isFinite(rate) ? Math.max(0, Math.min(1, rate)) : 0.35;
  return Math.round(base + r * spread);
}

function degreeToSize(deg, base = 26, spread = 28) {
  return Math.round(base + Math.min(deg, 8) * (spread / 8));
}

function toClassEchartsGraph(nodes, edges, options = {}) {
  const { studentMastery, taskMastery, highlightIds = [] } = options;
  const idSet = new Set(nodes.map((n) => n.id));
  const filteredEdges = edges.filter(
    (e) => idSet.has(e.from) && idSet.has(e.to) && CLASS_EDGE_SOLID.has(e.type)
  );

  const categories = CLASS_CATEGORIES.map((name) => ({ name }));
  const eNodes = nodes.map((n) => {
    let symbolSize = 32;
    let symbol = 'circle';
    if (n.type === 'class' || n.type === 'teaching_class') {
      symbolSize = 56;
      symbol = 'roundRect';
    } else if (n.type === 'student') {
      symbolSize = masteryToSize(studentMastery?.get(n.id), 30, 38);
    } else if (n.type === 'task') {
      symbol = 'rect';
      symbolSize = masteryToSize(taskMastery?.get(n.id), 32, 36);
    } else if (n.type === 'mistake_point') {
      symbol = 'diamond';
      symbolSize = 26;
    } else if (n.type === 'knowledge_point') {
      symbolSize = 24;
    }
    return {
      id: n.id,
      name: n.name,
      value: n.type,
      rawType: n.type,
      source_id: n.source_id,
      meta: n.meta,
      mistakeFreq: n.mistakeFreq,
      category: 0,
      symbol,
      symbolSize,
      label: { show: false },
      masteryRate: studentMastery?.get(n.id) ?? taskMastery?.get(n.id) ?? null,
      ...(highlightIds.includes(n.id)
        ? { itemStyle: { borderColor: '#b91c1c', borderWidth: 3 }, isHighRisk: n.mistakeFreq >= 3 }
        : {}),
    };
  });

  return {
    viewMode: 'class',
    nodes: eNodes,
    links: filteredEdges.map((e) => ({
      source: e.from,
      target: e.to,
      value: e.type,
      lineStyle: {
        type: 'solid',
        width: e.type === 'ASSIGNED_TO' || e.type === 'CONTAINS' ? 2 : 1.2,
        curveness: 0.12,
        opacity: 0.85,
      },
    })),
    categories,
  };
}

function mapCourseLinks(filteredEdges) {
  return filteredEdges.map((e) => ({
    source: e.from,
    target: e.to,
    value: e.type,
    lineStyle: {
      type: e.type === 'PREREQUISITE' ? 'dashed' : 'solid',
      width: e.type === 'PREREQUISITE' ? 2 : 1,
      curveness: e.type === 'PREREQUISITE' ? 0.2 : 0.08,
      opacity: e.type === 'PREREQUISITE' ? 0.9 : 0.7,
    },
  }));
}

function toCourseEchartsGraph(nodes, edges, options = {}) {
  const idSet = new Set(nodes.map((n) => n.id));
  const filteredEdges = edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));
  const degrees = computeDegrees([...idSet], filteredEdges);
  const layoutStyle =
    options.layoutStyle === 'force' || options.layoutStyle === 'hierarchical'
      ? options.layoutStyle
      : pickCourseLayoutStyle(nodes);
  const dense = nodes.length > 55;

  const layoutTier = {
    course: 0,
    chapter: 0,
    class: 0,
    teaching_class: 0,
    teacher: 0,
    task: 1,
    knowledge_point: 2,
    exercise: 1,
    mistake_point: 3,
  };
  const eNodes = nodes.map((n) => {
    const tier = layoutTier[n.type] != null ? layoutTier[n.type] : 2;
    let symbol = 'circle';
    if (n.type === 'knowledge_point') symbol = 'circle';
    else if (n.type === 'task' || n.type === 'exercise') symbol = 'rect';
    else if (n.type === 'chapter' || n.type === 'course') symbol = 'roundRect';
    else if (n.type === 'class' || n.type === 'teaching_class') symbol = 'roundRect';

    const deg = degrees.get(n.id) || 0;
    let symbolSize = degreeToSize(deg);
    if (n.type === 'task') symbolSize = Math.max(symbolSize, layoutStyle === 'force' ? 32 : 40);
    if (n.type === 'chapter' || n.type === 'course') symbolSize = 44;
    if (layoutStyle === 'force' && dense) {
      symbolSize = Math.min(symbolSize, n.type === 'task' ? 28 : 22);
    }

    return {
      id: n.id,
      name: n.name,
      value: n.type,
      rawType: n.type,
      source_id: n.source_id,
      meta: n.meta,
      category: 0,
      symbol,
      symbolSize,
      layoutTier: tier,
      degree: deg,
      label: { show: false, fontSize: dense ? 10 : 11 },
    };
  });

  if (layoutStyle === 'hierarchical') {
    assignHierarchicalPositions(eNodes);
  }

  const categories = COURSE_CATEGORIES.map((name) => ({ name }));
  return {
    viewMode: layoutStyle === 'force' ? 'course-force' : 'course',
    layoutStyle,
    nodes: eNodes,
    links: mapCourseLinks(filteredEdges),
    categories,
  };
}

/** @deprecated 通用转换，保留给学情等场景 */
function toEchartsGraph(nodes, edges, options = {}) {
  return toClassEchartsGraph(nodes, edges, options);
}

async function fetchTeachingClassMasteryStats(teachingClassId) {
  const [rows] = await pool.query(
    `SELECT s.student_id, s.task_id, gr.total_score
     FROM submissions s
     JOIN grading_results gr ON gr.submission_id = s.id
     JOIN tasks t ON t.id = s.task_id
     WHERE t.teaching_class_id = ? AND gr.total_score IS NOT NULL`,
    [teachingClassId]
  );
  const studentScores = new Map();
  const taskScores = new Map();
  for (const r of rows) {
    const sc = Number(r.total_score);
    if (!Number.isFinite(sc)) continue;
    const sid = `student_${r.student_id}`;
    if (!studentScores.has(sid)) studentScores.set(sid, []);
    studentScores.get(sid).push(sc);
    const tid = `task_${r.task_id}`;
    if (!taskScores.has(tid)) taskScores.set(tid, []);
    taskScores.get(tid).push(sc);
  }
  const studentMastery = new Map();
  studentScores.forEach((arr, id) => {
    studentMastery.set(id, arr.reduce((a, b) => a + b, 0) / arr.length / 100);
  });
  const taskMastery = new Map();
  taskScores.forEach((arr, id) => {
    taskMastery.set(id, Math.min(1, arr.reduce((a, b) => a + b, 0) / arr.length / 100));
  });
  return { studentMastery, taskMastery };
}

async function getTeacherKgScopes(teacherId) {
  const [adminRows] = await pool.query(
    `SELECT id, class_name, major, grade FROM classes WHERE teacher_id = ? ORDER BY class_name`,
    [teacherId]
  );
  const [tcRows] = await pool.query(
    `SELECT tc.id, tc.class_name, c.course_name
     FROM teaching_classes tc
     INNER JOIN teaching_class_teachers tct ON tct.teaching_class_id = tc.id
     LEFT JOIN courses c ON c.id = tc.course_id
     WHERE tct.teacher_id = ?
     ORDER BY tc.class_name`,
    [teacherId]
  );

  const administrativeClasses = adminRows.map((r) => ({
    scopeType: 'administrative_class',
    scopeId: Number(r.id),
    id: Number(r.id),
    name: r.class_name,
    label: `${r.class_name} · 行政班`,
    major: r.major,
    grade: r.grade,
  }));

  const teachingClasses = tcRows.map((r) => ({
    scopeType: 'teaching_class',
    scopeId: Number(r.id),
    id: Number(r.id),
    name: r.class_name,
    label: `${r.class_name} · 教学班`,
    courseName: r.course_name || null,
  }));

  return {
    administrativeClasses,
    teachingClasses,
    scopes: [...administrativeClasses, ...teachingClasses],
  };
}

async function buildScopeGraph({
  scopeNodeId,
  taskIds,
  studentNodeIds,
  includeTeachingClassId,
  includeClassNodeId,
  masteryStats,
}) {
  const taskNodeIds = new Set(taskIds.map((id) => `task_${id}`));
  const scopeStudentIds = new Set(studentNodeIds.filter(Boolean));

  let nodeIds;
  let edges;
  let nodes;

  if (!taskNodeIds.size) {
    nodeIds = [...new Set([scopeNodeId, ...scopeStudentIds].filter(Boolean))];
    const [forwardEdges, backEdges] = await Promise.all([
      kgGraphStore.listEdges({ fromIds: [scopeNodeId], limit: 500 }),
      kgGraphStore.listEdges({ toIds: [scopeNodeId], limit: 500 }),
    ]);
    edges = [
      ...forwardEdges.filter((e) => e.type === 'ASSIGNED_TO' && scopeStudentIds.has(e.to)),
      ...backEdges.filter((e) => e.type === 'BELONGS_TO'),
    ];
    const extraIds = new Set();
    for (const e of edges) {
      if (e.type === 'BELONGS_TO' && !nodeIds.includes(e.from)) extraIds.add(e.from);
    }
    nodeIds = [...new Set([...nodeIds, ...extraIds])];
    nodes = await kgGraphStore.listNodes({ ids: nodeIds, limit: 2000 });
  } else {
    const seeds = [scopeNodeId, ...taskNodeIds];
    ({ nodeIds, edges } = await expandNodeIds(seeds, 3));
    nodes = await kgGraphStore.listNodes({ ids: nodeIds, limit: 2000 });
    for (const e of edges) {
      if (e.type === 'ASSIGNED_TO' && e.from === scopeNodeId) {
        scopeStudentIds.add(e.to);
      }
    }
    const missingStudents = [...scopeStudentIds].filter((sid) => !nodeIds.includes(sid));
    if (missingStudents.length) {
      nodeIds = [...new Set([...nodeIds, ...missingStudents])];
      nodes = await kgGraphStore.listNodes({ ids: nodeIds, limit: 2000 });
    }
  }

  const kpFromTasks = new Set();
  for (const e of edges) {
    if ((e.type === 'CONTAINS' || e.type === 'HAS_KNOWLEDGE') && taskNodeIds.has(e.from)) {
      const toNode = nodes.find((n) => n.id === e.to);
      if (toNode?.type === 'knowledge_point') kpFromTasks.add(e.to);
    }
  }

  const topMistakes = pickScopedMistakeIds(nodes, edges, scopeStudentIds, taskNodeIds, 20);

  nodes = nodes.filter((n) => {
    if (n.type === 'chapter' || n.type === 'exercise') return false;
    if (n.type === 'class') {
      return includeClassNodeId ? n.id === includeClassNodeId : false;
    }
    if (n.type === 'teaching_class') {
      return includeTeachingClassId ? n.id === includeTeachingClassId : false;
    }
    if (n.type === 'course') {
      if (!taskNodeIds.size) {
        return edges.some((e) => e.type === 'BELONGS_TO' && e.to === scopeNodeId && e.from === n.id);
      }
      return true;
    }
    if (n.type === 'teacher') return taskNodeIds.size > 0;
    if (n.type === 'student') return scopeStudentIds.has(n.id);
    if (n.type === 'task') return taskNodeIds.has(n.id);
    if (n.type === 'knowledge_point') return kpFromTasks.has(n.id);
    if (n.type === 'mistake_point') return topMistakes.has(n.id);
    return false;
  });

  const idSet = new Set(nodes.map((n) => n.id));
  edges = edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));

  const weakIds = nodes.filter((n) => n.type === 'mistake_point').map((n) => n.id);

  const graph = await applyGraphNormalization(
    toClassEchartsGraph(nodes, edges, {
      studentMastery: masteryStats.studentMastery,
      taskMastery: masteryStats.taskMastery,
      highlightIds: weakIds,
    }),
    'teacher'
  );

  return { graph, nodes, edges, taskIds };
}

async function getClassGraph(classId) {
  const cid = String(classId);
  const classNodeId = `class_${cid}`;
  const taskIds = await getAdministrativeClassTaskIds(cid);
  const [studentRows] = await pool.query(
    `SELECT id FROM users WHERE class_id = ? AND role = 'student'`,
    [cid]
  );
  const studentNodeIds = studentRows.map((r) => `student_${r.id}`);
  const masteryStats = await fetchClassMasteryStats(cid);

  const { graph, nodes, edges } = await buildScopeGraph({
    scopeNodeId: classNodeId,
    taskIds,
    studentNodeIds,
    includeClassNodeId: classNodeId,
    includeTeachingClassId: null,
    masteryStats,
  });

  return {
    graph,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.filter((e) => CLASS_EDGE_SOLID.has(e.type)).length,
      classId: cid,
      scopeType: 'administrative_class',
      scopeId: Number(cid),
      taskCount: taskIds.length,
    },
  };
}

async function getTeachingClassGraph(teachingClassId) {
  const tcid = String(teachingClassId);
  const tcNodeId = `tc_${tcid}`;
  const taskIds = await getTeachingClassTaskIds(tcid);
  const [studentRows] = await pool.query(
    `SELECT student_id AS id FROM teaching_class_students WHERE teaching_class_id = ?`,
    [tcid]
  );
  const studentNodeIds = studentRows.map((r) => `student_${r.id}`);
  const masteryStats = await fetchTeachingClassMasteryStats(tcid);

  const { graph, nodes, edges } = await buildScopeGraph({
    scopeNodeId: tcNodeId,
    taskIds,
    studentNodeIds,
    includeClassNodeId: null,
    includeTeachingClassId: tcNodeId,
    masteryStats,
  });

  return {
    graph,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.filter((e) => CLASS_EDGE_SOLID.has(e.type)).length,
      teachingClassId: tcid,
      scopeType: 'teaching_class',
      scopeId: Number(tcid),
      taskCount: taskIds.length,
    },
  };
}

async function getTeacherGraph({ scopeType, scopeId }) {
  const type = String(scopeType || '').trim();
  const id = String(scopeId);
  if (type === 'teaching_class') {
    return getTeachingClassGraph(id);
  }
  if (type === 'administrative_class' || type === 'class') {
    return getClassGraph(id);
  }
  throw new Error('scopeType 无效');
}

async function getCourseGraph({ taskId, classId: _classId }) {
  const seed = [];
  if (taskId) seed.push(`task_${taskId}`);

  let nodes;
  let edges;

  if (seed.length) {
    const exp = await expandNodeIds(seed, 4);
    nodes = await kgGraphStore.listNodes({ ids: exp.nodeIds, limit: 2000 });
    edges = exp.edges;

    const taskNodeId = `task_${taskId}`;
    const kpIds = new Set();
    const chapterIds = new Set();
    const exerciseIds = new Set();

    for (const e of edges) {
      if ((e.type === 'CONTAINS' || e.type === 'HAS_KNOWLEDGE') && e.from === taskNodeId) {
        const t = nodes.find((n) => n.id === e.to);
        if (t?.type === 'knowledge_point') kpIds.add(e.to);
        if (t?.type === 'chapter') chapterIds.add(e.to);
      }
      if (e.type === 'CONTAINS' && e.to === taskNodeId) {
        const f = nodes.find((n) => n.id === e.from);
        if (f?.type === 'chapter') chapterIds.add(e.from);
      }
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const e of edges) {
        if (e.type === 'PREREQUISITE') {
          if (kpIds.has(e.from) && !kpIds.has(e.to)) {
            kpIds.add(e.to);
            changed = true;
          }
          if (kpIds.has(e.to) && !kpIds.has(e.from)) {
            kpIds.add(e.from);
            changed = true;
          }
        }
        if (e.type === 'CONTAINS' && kpIds.has(e.from) && nodes.find((n) => n.id === e.to)?.type === 'chapter') {
          chapterIds.add(e.to);
          changed = true;
        }
      }
    }

    for (const e of edges) {
      if (e.type === 'RELATES_TO') {
        if (kpIds.has(e.from) && nodes.find((n) => n.id === e.to)?.type === 'exercise') exerciseIds.add(e.to);
        if (kpIds.has(e.to) && nodes.find((n) => n.id === e.from)?.type === 'exercise') exerciseIds.add(e.from);
      }
    }

    nodes = nodes.filter((n) => {
      if (n.type === 'class' || n.type === 'student' || n.type === 'mistake_point') return false;
      if (n.type === 'task') return n.id === taskNodeId;
      if (n.type === 'chapter') return chapterIds.has(n.id);
      if (n.type === 'knowledge_point') return kpIds.has(n.id);
      if (n.type === 'exercise') return exerciseIds.has(n.id);
      return false;
    });

    const idSet = new Set(nodes.map((n) => n.id));
    edges = edges.filter(
      (e) =>
        idSet.has(e.from) &&
        idSet.has(e.to) &&
        COURSE_EDGE_TYPES.has(e.type)
    );
  } else {
    nodes = await kgGraphStore.listNodes({ limit: 1200 });
    nodes = nodes.filter((n) =>
      ['chapter', 'knowledge_point', 'exercise', 'task', 'course', 'class', 'administrative_class', 'teaching_class', 'teacher'].includes(
        n.type
      )
    );
    const ids = nodes.map((n) => n.id);
    edges = await kgGraphStore.listEdges({ fromIds: ids, limit: 5000 });
    const back = await kgGraphStore.listEdges({ toIds: ids, limit: 5000 });
    const edgeSeen = new Set();
    edges = [...edges, ...back].filter((e) => {
      const k = `${e.from}|${e.to}|${e.type}`;
      if (edgeSeen.has(k)) return false;
      edgeSeen.add(k);
      return true;
    });
    nodes = nodes.filter((n) => n.type !== 'student');
  }

  const idSet = new Set(nodes.map((n) => n.id));
  edges = edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));

  const layoutStyle = taskId ? pickCourseLayoutStyle(nodes) : 'force';
  const graph = await applyGraphNormalization(
    toCourseEchartsGraph(nodes, edges, { layoutStyle }),
    'admin'
  );

  return {
    graph,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      taskId: taskId || null,
      layoutStyle: graph.layoutStyle,
      layoutHint:
        layoutStyle === 'force'
          ? '节点较多，已自动切换力导向总览布局（可拖拽、缩放）'
          : '层次结构布局',
    },
  };
}

function filterStudentSubgraph(studentId, nodes, edges) {
  const sid = `student_${studentId}`;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const blocked = new Set(['class', 'chapter', 'exercise', 'teaching_class', 'teacher', 'course']);
  const allowed = new Set([sid]);
  const queue = [sid];

  while (queue.length) {
    const cur = queue.shift();
    for (const e of edges) {
      if (e.from !== cur && e.to !== cur) continue;
      if (e.from.startsWith('class_') || e.to.startsWith('class_')) continue;
      if (e.from.startsWith('tc_') || e.to.startsWith('tc_')) continue;
      if (e.type === 'ASSIGNED_TO') continue;
      const other = e.from === cur ? e.to : e.from;
      const on = nodeMap.get(other);
      if (!on || blocked.has(on.type)) continue;
      if (on.type === 'student' && other !== sid) continue;
      if (!STUDENT_EDGE_TYPES.has(e.type)) continue;
      if (!allowed.has(other)) {
        allowed.add(other);
        queue.push(other);
      }
    }
  }

  const filteredNodes = nodes.filter(
    (n) => allowed.has(n.id) && !(n.type === 'student' && n.id !== sid) && !blocked.has(n.type)
  );
  const idSet = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter(
    (e) =>
      idSet.has(e.from) &&
      idSet.has(e.to) &&
      STUDENT_EDGE_TYPES.has(e.type) &&
      !e.from.startsWith('class_') &&
      !e.to.startsWith('class_') &&
      !e.from.startsWith('tc_') &&
      !e.to.startsWith('tc_')
  );

  return { nodes: filteredNodes, edges: filteredEdges };
}

async function fetchStudentKpMastery(studentId, sid, edges) {
  const kpMastery = new Map();
  for (const e of edges) {
    if (e.from === sid && e.type === 'MASTERED') {
      kpMastery.set(e.to, Math.max(kpMastery.get(e.to) || 0, 0.85));
    }
    if (e.from === sid && e.type === 'WEAK_IN') {
      kpMastery.set(e.to, Math.min(kpMastery.get(e.to) ?? 0.5, 0.35));
    }
  }
  const [rows] = await pool.query(
    `SELECT s.task_id, AVG(gr.total_score) AS avg_score
     FROM submissions s
     JOIN grading_results gr ON gr.submission_id = s.id
     WHERE s.student_id = ? AND gr.total_score IS NOT NULL
     GROUP BY s.task_id`,
    [studentId]
  );
  const taskScore = new Map(rows.map((r) => [`task_${r.task_id}`, Number(r.avg_score) / 100]));
  return { kpMastery, taskScore };
}

function toStudentEchartsGraph(nodes, edges, options = {}) {
  const { studentId: sid, kpMastery, taskScore, highlightIds = [] } = options;
  const idSet = new Set(nodes.map((n) => n.id));
  const filteredEdges = edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));

  const categories = STUDENT_CATEGORIES.map((name) => ({ name }));
  const eNodes = nodes.map((n) => {
    let symbol = 'circle';
    let symbolSize = 28;
    if (n.id === sid) {
      symbolSize = 54;
    } else if (n.type === 'task') {
      symbol = 'rect';
      symbolSize = masteryToSize(taskScore?.get(n.id), 30, 34);
    } else if (n.type === 'mistake_point') {
      symbol = 'diamond';
      symbolSize = 30;
    } else if (n.type === 'knowledge_point') {
      symbolSize = masteryToSize(kpMastery?.get(n.id), 24, 26);
    }
    const displayName = n.id === sid ? n.name || '我' : n.name;
    return {
      id: n.id,
      name: displayName,
      value: n.type,
      rawType: n.type,
      source_id: n.source_id,
      meta: n.meta,
      category: 0,
      symbol,
      symbolSize,
      label: { show: false },
      masteryRate: kpMastery?.get(n.id) ?? taskScore?.get(n.id) ?? null,
      ...(highlightIds.includes(n.id)
        ? { itemStyle: { borderColor: '#dc2626', borderWidth: 3 }, isHighRisk: true }
        : n.id === sid
          ? { itemStyle: { borderColor: '#7c3aed', borderWidth: 3 } }
          : {}),
    };
  });

  return {
    viewMode: 'student',
    layoutStyle: 'force',
    nodes: eNodes,
    links: filteredEdges.map((e) => ({
      source: e.from,
      target: e.to,
      value: e.type,
      lineStyle: {
        type: 'solid',
        width: e.type === 'MASTERED' ? 2.5 : e.type === 'MISTAKE_ON' ? 2 : 1.2,
        curveness: 0.14,
        opacity: 0.85,
        color: e.type === 'WEAK_IN' || e.type === 'MISTAKE_ON' ? '#dc2626' : '#7c3aed',
      },
    })),
    categories,
  };
}

async function getStudentGraph(studentId) {
  const sid = `student_${studentId}`;
  const [subs] = await pool.query(
    `SELECT DISTINCT s.task_id FROM submissions s WHERE s.student_id = ? LIMIT 80`,
    [studentId]
  );
  const seeds = [sid, ...subs.map((r) => `task_${r.task_id}`)];
  const exp = await expandNodeIds(seeds, 3);
  let nodes = await kgGraphStore.listNodes({ ids: exp.nodeIds, limit: 1500 });
  let edges = exp.edges;

  const filtered = filterStudentSubgraph(studentId, nodes, edges);
  nodes = filtered.nodes;
  edges = filtered.edges;

  const { kpMastery, taskScore } = await fetchStudentKpMastery(studentId, sid, edges);
  const highlightIds = [
    ...nodes.filter((n) => n.type === 'mistake_point').map((n) => n.id),
    ...edges.filter((e) => e.from === sid && e.type === 'WEAK_IN').map((e) => e.to),
  ];

  const graph = await applyGraphNormalization(
    toStudentEchartsGraph(nodes, edges, {
      studentId: sid,
      kpMastery,
      taskScore,
      highlightIds,
    }),
    'student',
    { selfStudentId: sid }
  );

  return {
    graph,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      studentId: String(studentId),
      masteredCount: edges.filter((e) => e.from === sid && e.type === 'MASTERED').length,
      weakCount: highlightIds.length,
      layoutHint: '仅展示您本人的任务、知识点与错题关联',
    },
  };
}

async function getGradingContext(submissionId) {
  const [rows] = await pool.query(
    `SELECT s.id, s.student_id, s.task_id, s.content, gr.ai_problems, gr.dimension_scores, gr.ai_comment,
            t.title, t.requirements, t.class_id
     FROM submissions s
     JOIN tasks t ON t.id = s.task_id
     LEFT JOIN grading_results gr ON gr.submission_id = s.id
     WHERE s.id = ? LIMIT 1`,
    [submissionId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  const taskNode = `task_${row.task_id}`;
  const { nodeIds, edges } = await expandNodeIds([taskNode], 2);

  const kps = (await kgGraphStore.listNodes({ ids: nodeIds, limit: 500 })).filter(
    (n) => n.type === 'knowledge_point'
  );

  const prerequisites = edges
    .filter((e) => e.type === 'PREREQUISITE')
    .map((e) => {
      const to = kps.find((n) => n.id === e.to);
      const from = kps.find((n) => n.id === e.from);
      return to && from ? { from: from.name, to: to.name } : null;
    })
    .filter(Boolean);

  const relatedExercises = (await kgGraphStore.listNodes({ ids: nodeIds, limit: 500 }))
    .filter((n) => n.type === 'exercise')
    .slice(0, 8);

  const gaps = String(row.ai_problems || '')
    .split(/[。\n；;]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 4)
    .slice(0, 6);

  return {
    submissionId: Number(submissionId),
    taskId: row.task_id,
    taskTitle: row.title,
    prerequisites,
    relatedExercises: relatedExercises.map((e) => ({ id: e.id, name: e.name })),
    knowledgeGaps: gaps,
    note: '图谱增强数据来自 MariaDB 权威存储，与批改结果并列展示，不修改批改流程',
  };
}

module.exports = {
  toEchartsGraph,
  toClassEchartsGraph,
  toCourseEchartsGraph,
  toStudentEchartsGraph,
  getCourseGraph,
  getClassGraph,
  getTeachingClassGraph,
  getTeacherGraph,
  getTeacherKgScopes,
  getStudentGraph,
  getGradingContext,
};
