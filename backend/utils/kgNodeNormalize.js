/**
 * 知识图谱节点/关系规范化：统一 type、displayName、中文关系标签
 */

const pool = require('../config/database');

/** 后端存储 type → 对外 canonical type */
const TYPE_CANONICAL = {
  class: 'administrative_class',
  teaching_class: 'teaching_class',
  course: 'course',
  chapter: 'chapter',
  teacher: 'teacher',
  student: 'student',
  task: 'task',
  knowledge_point: 'knowledge_point',
  exercise: 'exercise',
  mistake_point: 'weakness',
  aggregate: 'aggregate',
  entity: 'knowledge_point',
};

/** canonical type → 中文类型名 */
const TYPE_LABELS = {
  course: '课程',
  chapter: '章节',
  administrative_class: '行政班',
  teaching_class: '教学班',
  teacher: '教师',
  student: '学生',
  task: '任务',
  exercise: '习题',
  knowledge_point: '知识点',
  weakness: '薄弱点',
  error: '高频错误',
  aggregate: '聚合节点',
};

const RELATION_LABELS = {
  CONTAINS: '包含',
  PREREQUISITE: '前置知识',
  RELATES_TO: '相关',
  ASSIGNED_TO: '发布给',
  BELONGS_TO: '属于',
  HAS_TASK: '包含任务',
  HAS_KNOWLEDGE: '关联知识点',
  HAS_WEAKNESS: '存在薄弱点',
  HAS_ERROR: '出现错误',
  SUBMITTED: '提交',
  GRADED: '批改',
  MENTIONS: '提及',
  SIMILAR_TO: '相似',
  SEMANTIC_RELATED: '相似',
  SEMANTIC_SIMILAR: '相似',
  MASTERED: '已掌握',
  WEAK_IN: '薄弱',
  MISTAKE_ON: '错因关联',
  RELATED: '相关',
  AGGREGATE: '聚合',
};

const ADMIN_CATEGORIES = [
  '课程',
  '章节',
  '行政班',
  '教学班',
  '教师',
  '任务',
  '习题',
  '知识点',
  '薄弱点',
  '高频错误',
];

const TEACHER_CATEGORIES = ['行政班', '教学班', '学生', '任务', '知识点', '薄弱点', '高频错误'];

const STUDENT_CATEGORIES = ['我', '任务', '知识点', '薄弱点', '高频错误'];

const ADMIN_CAT_INDEX = {
  course: 0,
  chapter: 1,
  administrative_class: 2,
  teaching_class: 3,
  teacher: 4,
  task: 5,
  exercise: 6,
  knowledge_point: 7,
  weakness: 8,
  error: 9,
  aggregate: 0,
};

const TEACHER_CAT_INDEX = {
  administrative_class: 0,
  teaching_class: 1,
  student: 2,
  task: 3,
  knowledge_point: 4,
  weakness: 5,
  error: 6,
  aggregate: 0,
};

const STUDENT_CAT_INDEX = {
  student: 0,
  task: 1,
  knowledge_point: 2,
  weakness: 3,
  error: 4,
  aggregate: 0,
};

function relationLabel(type) {
  if (!type) return '未知关系';
  return RELATION_LABELS[type] || '未知关系';
}

function parsePositiveIntId(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function extractPrefixedId(n, prefix, types = []) {
  const rawType = n.type || n.value;
  const id = String(n.id || '');
  const fromSource = parsePositiveIntId(n.source_id);
  if (fromSource != null) return fromSource;
  if (types.includes(rawType) || id.startsWith(`${prefix}_`)) {
    const tail = id.slice(prefix.length + 1);
    if (/^\d+$/.test(tail)) return parsePositiveIntId(tail);
  }
  return null;
}

function extractClassId(n) {
  const rawType = n.type || n.value;
  if (rawType === 'teaching_class') return null;
  return extractPrefixedId(n, 'class', ['class', 'administrative_class']);
}

function extractTeachingClassId(n) {
  return extractPrefixedId(n, 'tc', ['teaching_class']);
}

function isBrokenLabel(label) {
  return !label || /#NaN/i.test(String(label)) || /^行政班\s*#?\s*$/i.test(String(label));
}

function formatScopedLabel(prefix, id, dbName, nodeName, legacyNamePattern) {
  if (dbName) return dbName;
  const name = String(nodeName || '').trim();
  if (name && !isBrokenLabel(name) && (!legacyNamePattern || !legacyNamePattern.test(name))) {
    return name;
  }
  if (id != null) return `${prefix} #${id}`;
  return null;
}

function isValidAdministrativeClassNode(n) {
  const type = n.type || n.value;
  if (type !== 'administrative_class' && type !== 'class') return true;
  if (isBrokenLabel(n.displayName || n.name)) return false;
  const cid = extractClassId(n);
  if (cid != null) return true;
  const name = String(n.displayName || n.name || '').trim();
  return name.length > 0 && !/^班级\d+$/.test(name) && name !== '未知行政班';
}

function filterInvalidScopeNodes(nodes, links = []) {
  if (!Array.isArray(nodes) || !nodes.length) return { nodes: nodes || [], links: links || [] };
  const kept = nodes.filter(isValidAdministrativeClassNode);
  const idSet = new Set(kept.map((n) => n.id));
  const nextLinks = (links || []).filter((e) => {
    const from = e.from ?? e.source;
    const to = e.to ?? e.target;
    return idSet.has(from) && idSet.has(to);
  });
  return { nodes: kept, links: nextLinks };
}

function canonicalType(rawType, meta = {}) {
  if (rawType === 'class') {
    return meta.classKind === 'teaching' ? 'teaching_class' : 'administrative_class';
  }
  if (rawType === 'teaching_class') return 'teaching_class';
  return TYPE_CANONICAL[rawType] || rawType || 'knowledge_point';
}

function typeLabel(canonical) {
  if (TYPE_LABELS[canonical]) return TYPE_LABELS[canonical];
  if (!canonical || /^[a-z_]+$/.test(String(canonical))) return '未知节点';
  return String(canonical);
}

function categoryIndex(canonical, viewRole) {
  if (viewRole === 'admin') return ADMIN_CAT_INDEX[canonical] ?? 5;
  if (viewRole === 'student') return STUDENT_CAT_INDEX[canonical] ?? 2;
  return TEACHER_CAT_INDEX[canonical] ?? 4;
}

function categoriesForRole(viewRole) {
  if (viewRole === 'admin') return ADMIN_CATEGORIES.map((name) => ({ name }));
  if (viewRole === 'student') return STUDENT_CATEGORIES.map((name) => ({ name }));
  return TEACHER_CATEGORIES.map((name) => ({ name }));
}

async function loadNodeMetaMap(nodes) {
  const classIds = [];
  const tcIds = [];
  const courseIds = [];
  const teacherIds = [];
  const taskIds = [];

  for (const n of nodes) {
    if (n.type === 'class' || n.type === 'administrative_class' || n.id?.startsWith('class_')) {
      const id = extractClassId(n);
      if (id != null) classIds.push(id);
    }
    if (n.type === 'teaching_class' || n.id?.startsWith('tc_')) {
      const id = extractTeachingClassId(n);
      if (id != null) tcIds.push(id);
    }
    if (n.type === 'course' || n.id?.startsWith('course_')) {
      const id = n.source_id || String(n.id || '').replace(/^course_/, '');
      if (id) courseIds.push(Number(id));
    }
    if (n.type === 'teacher' || n.id?.startsWith('teacher_')) {
      const id = n.source_id || String(n.id || '').replace(/^teacher_/, '');
      if (id) teacherIds.push(Number(id));
    }
    if (n.type === 'task' || n.id?.startsWith('task_')) {
      const id = n.source_id || String(n.id || '').replace(/^task_/, '');
      if (id) taskIds.push(Number(id));
    }
  }

  const meta = { classes: new Map(), teachingClasses: new Map(), courses: new Map(), teachers: new Map(), tasks: new Map() };

  if (classIds.length) {
    const uniq = [...new Set(classIds.filter(Boolean))];
    const [rows] = await pool.query(
      `SELECT id, class_name, teacher_id FROM classes WHERE id IN (${uniq.map(() => '?').join(',')})`,
      uniq
    );
    rows.forEach((r) => meta.classes.set(Number(r.id), r));
  }
  if (tcIds.length) {
    const uniq = [...new Set(tcIds.filter(Boolean))];
    const [rows] = await pool.query(
      `SELECT tc.id, tc.class_name, tc.course_id, c.course_name
       FROM teaching_classes tc
       LEFT JOIN courses c ON c.id = tc.course_id
       WHERE tc.id IN (${uniq.map(() => '?').join(',')})`,
      uniq
    );
    rows.forEach((r) => meta.teachingClasses.set(Number(r.id), r));
  }
  if (courseIds.length) {
    const uniq = [...new Set(courseIds.filter(Boolean))];
    const [rows] = await pool.query(
      `SELECT id, course_name, course_code FROM courses WHERE id IN (${uniq.map(() => '?').join(',')})`,
      uniq
    );
    rows.forEach((r) => meta.courses.set(Number(r.id), r));
  }
  if (teacherIds.length) {
    const uniq = [...new Set(teacherIds.filter(Boolean))];
    const [rows] = await pool.query(
      `SELECT id, real_name FROM users WHERE id IN (${uniq.map(() => '?').join(',')})`,
      uniq
    );
    rows.forEach((r) => meta.teachers.set(Number(r.id), r));
  }
  if (taskIds.length) {
    const uniq = [...new Set(taskIds.filter(Number.isFinite))];
    if (uniq.length) {
      const [rows] = await pool.query(
        `SELECT id, title, class_id, teaching_class_id, course_id FROM tasks WHERE id IN (${uniq.map(() => '?').join(',')})`,
        uniq
      );
      rows.forEach((r) => meta.tasks.set(Number(r.id), r));
    }
  }

  return meta;
}

function resolveDisplayName(n, metaMap, options = {}) {
  const rawType = n.type || n.value;
  const id = n.id || '';
  const parsedMeta = n.meta && typeof n.meta === 'object' ? n.meta : null;

  if (rawType === 'class' || rawType === 'administrative_class' || id.startsWith('class_')) {
    const cid = extractClassId(n);
    const row = cid != null ? metaMap.classes.get(cid) : null;
    const label = formatScopedLabel('行政班', cid, row?.class_name, n.name, /^班级\d+$/);
    if (label) return label;
    return '未知行政班';
  }
  if (rawType === 'teaching_class' || id.startsWith('tc_')) {
    const tid = extractTeachingClassId(n);
    const row = tid != null ? metaMap.teachingClasses.get(tid) : null;
    const label = formatScopedLabel('教学班', tid, row?.class_name, n.name);
    if (label) return label;
    return '未知教学班';
  }
  if (rawType === 'course' || id.startsWith('course_')) {
    const cid = extractPrefixedId(n, 'course', ['course']);
    const row = cid != null ? metaMap.courses.get(cid) : null;
    const label = formatScopedLabel('课程', cid, row?.course_name, n.name);
    if (label) return label;
    return '未知课程';
  }
  if (rawType === 'chapter') {
    const base = n.name || '章节';
    return base.startsWith('章节') ? base : `章节：${base}`;
  }
  if (rawType === 'teacher' || id.startsWith('teacher_')) {
    const tid = extractPrefixedId(n, 'teacher', ['teacher']);
    const row = tid != null ? metaMap.teachers.get(tid) : null;
    return row?.real_name || n.name || (tid != null ? `教师 #${tid}` : '未知教师');
  }
  if (rawType === 'student' && options.selfStudentId && id === options.selfStudentId) {
    return n.name || '我';
  }
  if (rawType === 'mistake_point') {
    const prob = parsedMeta?.summary || n.name;
    if (prob && !/^错题#/.test(prob)) return String(prob).slice(0, 80);
    return n.name || '薄弱点';
  }

  if (rawType === 'task' || id.startsWith('task_')) {
    const tid = Number(n.source_id || id.replace(/^task_/, ''));
    const row = metaMap.tasks.get(tid);
    if (row?.title) return row.title;
  }
  if (rawType === 'exercise') {
    return n.displayName || n.name || '习题';
  }

  return n.displayName || n.name || n.title || n.label || id;
}

function normalizeNode(n, metaMap, viewRole, options = {}) {
  const rawType = n.type || n.value;
  const parsedMeta = n.meta && typeof n.meta === 'object' ? n.meta : {};
  let canonical = canonicalType(rawType, parsedMeta);
  const displayName = resolveDisplayName(n, metaMap, options);

  if (rawType === 'mistake_point' && (n.mistakeFreq >= 3 || parsedMeta.highRisk)) {
    canonical = 'error';
  }

  const cat = categoryIndex(canonical, viewRole);
  return {
    ...n,
    type: canonical,
    value: canonical,
    rawType,
    displayName,
    name: displayName,
    typeLabel: typeLabel(canonical),
    classKind:
      canonical === 'administrative_class'
        ? 'administrative'
        : canonical === 'teaching_class'
          ? 'teaching'
          : parsedMeta.classKind || null,
    category: cat,
  };
}

function normalizeLink(e) {
  const type = e.type || e.value;
  return {
    source: e.from || e.source,
    target: e.to || e.target,
    value: type,
    relationType: type,
    relationLabel: relationLabel(type),
    lineStyle: e.lineStyle,
  };
}

async function enrichNodesFromDb(nodes) {
  return loadNodeMetaMap(nodes);
}

async function buildNormalizedGraph(rawNodes, rawEdges, viewRole, options = {}) {
  const metaMap = await loadNodeMetaMap(rawNodes);
  const nodes = rawNodes.map((n) => normalizeNode(n, metaMap, viewRole, options));
  const links = rawEdges.map((e) => normalizeLink(e));
  return {
    nodes,
    links,
    categories: categoriesForRole(viewRole),
    metaMap,
  };
}

function taskNodePriority(n) {
  let score = 0;
  const sid = n.source_id || (String(n.id).match(/^task_(\d+)$/) || [])[1];
  if (sid) score += 100;
  if (/^task_\d+$/.test(String(n.id))) score += 50;
  if (n.source_table === 'tasks') score += 20;
  return score;
}

/**
 * 合并同名/同业务的重复任务节点（历史 seed 与 rule 构建并存时）
 */
function dedupeGraphNodes(nodes, links = []) {
  if (!Array.isArray(nodes) || !nodes.length) return { nodes: nodes || [], links: links || [] };

  const idRemap = new Map();
  const byName = new Map();
  const classByKey = new Map();

  for (const n of nodes) {
    const type = n.type || n.value;
    if (type === 'class' || type === 'administrative_class') {
      const cid = extractClassId(n);
      const key = cid != null ? `cid:${cid}` : `name:${String(n.name || n.displayName || '').trim()}`;
      if (!key.endsWith(':') && key !== 'name:') {
        if (!classByKey.has(key)) classByKey.set(key, []);
        classByKey.get(key).push(n);
      }
    }
    if (type !== 'task') continue;
    const name = String(n.name || n.displayName || '').trim();
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(n);
  }

  for (const group of byName.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => taskNodePriority(b) - taskNodePriority(a));
    const keep = sorted[0];
    for (const n of sorted.slice(1)) {
      idRemap.set(n.id, keep.id);
    }
  }

  for (const group of classByKey.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => {
      const aScore = extractClassId(a) != null ? 10 : 0;
      const bScore = extractClassId(b) != null ? 10 : 0;
      if (aScore !== bScore) return bScore - aScore;
      return String(a.name || '').length - String(b.name || '').length;
    });
    const keep = sorted[0];
    for (const n of sorted.slice(1)) {
      idRemap.set(n.id, keep.id);
    }
  }

  if (!idRemap.size) return { nodes, links };

  const dropIds = new Set(idRemap.keys());
  const keptNodes = nodes.filter((n) => !dropIds.has(n.id));

  const remap = (id) => {
    let cur = id;
    const guard = new Set();
    while (idRemap.has(cur) && !guard.has(cur)) {
      guard.add(cur);
      cur = idRemap.get(cur);
    }
    return cur;
  };

  const edgeSeen = new Set();
  const keptIds = new Set(keptNodes.map((n) => n.id));
  const nextLinks = [];
  for (const e of links) {
    const from = remap(e.from ?? e.source);
    const to = remap(e.to ?? e.target);
    if (!from || !to || from === to) continue;
    if (!keptIds.has(from) || !keptIds.has(to)) continue;
    const type = e.type || e.value || e.relationType || '';
    const key = `${from}|${to}|${type}`;
    if (edgeSeen.has(key)) continue;
    edgeSeen.add(key);
    nextLinks.push({
      ...e,
      from,
      to,
      source: from,
      target: to,
    });
  }

  return { nodes: keptNodes, links: nextLinks };
}

module.exports = {
  RELATION_LABELS,
  TYPE_LABELS,
  TYPE_CANONICAL,
  relationLabel,
  canonicalType,
  typeLabel,
  categoriesForRole,
  loadNodeMetaMap,
  resolveDisplayName,
  normalizeNode,
  normalizeLink,
  enrichNodesFromDb,
  buildNormalizedGraph,
  dedupeGraphNodes,
  filterInvalidScopeNodes,
  extractClassId,
};
