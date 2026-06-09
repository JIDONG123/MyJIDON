/** 关系类型英文 value → 中文展示 */
export const RELATION_LABELS = {
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
  UNKNOWN: '未知关系',
};

export function relationLabel(type) {
  if (!type) return '未知关系';
  return RELATION_LABELS[type] || '未知关系';
}

/** 下拉固定顺序 + 图内动态合并 */
export const RELATION_FILTER_OPTIONS = [
  { value: 'CONTAINS', label: '包含' },
  { value: 'PREREQUISITE', label: '前置知识' },
  { value: 'RELATES_TO', label: '相关' },
  { value: 'HAS_TASK', label: '包含任务' },
  { value: 'HAS_KNOWLEDGE', label: '关联知识点' },
  { value: 'HAS_WEAKNESS', label: '存在薄弱点' },
  { value: 'HAS_ERROR', label: '出现错误' },
  { value: 'SUBMITTED', label: '提交' },
  { value: 'GRADED', label: '批改' },
  { value: 'SEMANTIC_RELATED', label: '相似' },
  { value: 'MASTERED', label: '已掌握' },
  { value: 'WEAK_IN', label: '薄弱' },
  { value: 'MISTAKE_ON', label: '错因关联' },
  { value: 'ASSIGNED_TO', label: '发布给' },
  { value: 'BELONGS_TO', label: '属于' },
];

export function relationOptionsFromGraph(graph) {
  const present = new Set(
    (graph?.relationTypes?.length
      ? graph.relationTypes
      : (graph?.links || []).map((l) => l.relationType || l.value)
    ).filter(Boolean)
  );
  const ordered = RELATION_FILTER_OPTIONS.filter((o) => present.has(o.value));
  for (const t of present) {
    if (!ordered.some((o) => o.value === t)) {
      ordered.push({ value: t, label: relationLabel(t) });
    }
  }
  return ordered;
}

export const LAYOUT_OPTIONS = [
  { value: 'force', label: '力导向布局' },
  { value: 'smart', label: '智能布局' },
  { value: 'layer', label: '层级布局' },
  { value: 'circular', label: '环形布局' },
];

export const NODE_TYPE_LABELS = {
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

const ENGLISH_RAW_TYPES = new Set([
  'knowledge_point',
  'mistake_point',
  'administrative_class',
  'teaching_class',
  'CONTAINS',
  'RELATES_TO',
]);

export function nodeTypeLabel(type) {
  if (NODE_TYPE_LABELS[type]) return NODE_TYPE_LABELS[type];
  if (!type || ENGLISH_RAW_TYPES.has(type) || /^[a-z_]+$/.test(String(type))) return '未知节点';
  return String(type);
}
