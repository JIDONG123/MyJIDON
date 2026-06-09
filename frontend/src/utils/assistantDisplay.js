/** 学生端 AI 学习助手 — 展示常量（不改后端） */

export const ASSISTANT_MODES = {
  knowledge_base: {
    label: '知识库命中',
    tagType: 'success',
    tone: 'kb',
    description: '主要依据教师知识库内容回答',
  },
  task_context: {
    label: '任务要求',
    tagType: 'primary',
    tone: 'task',
    description: '主要结合本班 / 教学班任务要求回答',
  },
  general_advice: {
    label: '通用学习建议',
    tagType: 'warning',
    tone: 'general',
    description: '未命中直接相关的知识库，提供通用学习建议',
  },
  need_teacher_confirm: {
    label: '需教师确认',
    tagType: 'info',
    tone: 'confirm',
    description: '涉及评分或细则，请以教师发布要求为准',
  },
};

export function modeMeta(mode) {
  return ASSISTANT_MODES[mode] || ASSISTANT_MODES.general_advice;
}

export const KB_CATEGORY_LABELS = {
  guide: '指导说明',
  standard: '评分标准',
  example: '示例参考',
  pitfalls: '常见误区',
  other: '其他资料',
};

export function categoryLabel(category) {
  return KB_CATEGORY_LABELS[category] || category || '资料';
}

export const QUICK_PROMPTS = [
  '解释当前任务要求',
  '我该如何开始这个实训？',
  '帮我检查提交规范',
  'Python 列表怎么统计平均分？',
  'Vue 路由怎么配置？',
  '代码报错怎么排查？',
  'README 应该怎么写？',
];

const META_STORAGE_PREFIX = 'sg_assistant_msg_meta_';

export function metaStorageKey(userId) {
  return userId != null ? `${META_STORAGE_PREFIX}${userId}` : `${META_STORAGE_PREFIX}anon`;
}

export function loadMessageMetaMap(userId) {
  try {
    const raw = sessionStorage.getItem(metaStorageKey(userId));
    if (!raw) return {};
    const o = JSON.parse(raw);
    return typeof o === 'object' && o ? o : {};
  } catch {
    return {};
  }
}

export function saveMessageMeta(userId, messageId, meta) {
  if (messageId == null) return;
  const map = loadMessageMetaMap(userId);
  map[String(messageId)] = meta;
  try {
    sessionStorage.setItem(metaStorageKey(userId), JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getMessageMeta(map, messageId) {
  if (!messageId || !map) return null;
  return map[String(messageId)] || null;
}
