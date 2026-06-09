const pool = require('../config/database');
const { TASK_CURRICULUM_JOINS, TASK_CURRICULUM_SELECT } = require('./curriculumQuery');

const TASK_GRADING_EXTRA_SELECT = `
  co.course_goal,
  co.ability_goals,
  tpl.description AS template_description,
  tpl.suggested_materials AS template_suggested_materials
`;

/**
 * 加载任务及课程/教学班/项目模板上下文，供 AI 批改注入。
 */
async function loadTaskGradingContext(taskId) {
  const id = Number(taskId);
  if (!Number.isFinite(id) || id < 1) return null;

  const [rows] = await pool.query(
    `
    SELECT t.id, t.title, t.requirements, t.scoring_criteria, t.scenario_type, t.enterprise_standard,
           t.evaluation_metrics, t.max_score, t.step_checklist, t.difficulty_level, t.week_no,
           ${TASK_CURRICULUM_SELECT},
           ${TASK_GRADING_EXTRA_SELECT}
    FROM tasks t
    ${TASK_CURRICULUM_JOINS}
    WHERE t.id = ?
    LIMIT 1
  `,
    [id]
  );
  return rows[0] || null;
}

function trimBlock(s) {
  const t = String(s || '').trim();
  return t || '';
}

/**
 * 课程/教学班/项目模板上下文块，拼入 LLM user 提示词。
 */
function buildCurriculumPromptBlock(task) {
  if (!task) return '';
  const parts = [];

  if (task.course_name || task.course_code) {
    parts.push(`【所属课程】${[task.course_code, task.course_name].filter(Boolean).join(' ')}`);
  }
  if (trimBlock(task.course_goal)) {
    parts.push(`【课程目标】\n${trimBlock(task.course_goal)}`);
  }
  if (trimBlock(task.ability_goals)) {
    parts.push(`【能力目标】\n${trimBlock(task.ability_goals)}`);
  }
  if (task.teaching_class_name || task.term_name) {
    parts.push(
      `【教学班】${[task.teaching_class_name, task.term_name ? `学期：${task.term_name}` : ''].filter(Boolean).join(' · ')}`
    );
  }
  if (task.week_no != null && task.week_no !== '') {
    parts.push(`【教学周次】第 ${task.week_no} 周`);
  }
  if (trimBlock(task.template_project_name)) {
    parts.push(`【实训项目（模板）】${trimBlock(task.template_project_name)}`);
  }
  if (trimBlock(task.template_description)) {
    parts.push(`【项目说明】\n${trimBlock(task.template_description)}`);
  }
  if (trimBlock(task.template_suggested_materials)) {
    parts.push(`【建议提交材料】\n${trimBlock(task.template_suggested_materials)}`);
  }

  if (!parts.length) return '';
  return `\n\n【课程与教学班背景（批改须对照以下教学目标与项目定位）】\n${parts.join('\n\n')}\n`;
}

/**
 * 将 DB 上下文字段合并到批改用 task 对象（不覆盖任务正文要求）。
 */
function applyGradingContextToTask(task, ctx) {
  if (!task || !ctx) return task;
  const keys = [
    'course_id',
    'course_code',
    'course_name',
    'course_goal',
    'ability_goals',
    'teaching_class_id',
    'teaching_class_code',
    'teaching_class_name',
    'term_id',
    'term_name',
    'project_template_id',
    'template_project_name',
    'template_description',
    'template_suggested_materials',
    'week_no',
  ];
  for (const k of keys) {
    if (task[k] == null && ctx[k] != null) task[k] = ctx[k];
  }
  return task;
}

async function enrichTaskForGrading(task, taskId) {
  if (!task) return task;
  const tid = taskId != null ? taskId : task.id;
  const hasCurriculum =
    trimBlock(task.course_goal) ||
    trimBlock(task.ability_goals) ||
    trimBlock(task.template_project_name) ||
    trimBlock(task.course_name);
  if (hasCurriculum) return task;
  const ctx = await loadTaskGradingContext(tid);
  return applyGradingContextToTask({ ...task }, ctx);
}

module.exports = {
  loadTaskGradingContext,
  buildCurriculumPromptBlock,
  applyGradingContextToTask,
  enrichTaskForGrading,
};
