/** 任务列表/详情中与课程-教学班相关的 SELECT 片段 */

const TASK_CURRICULUM_SELECT = `
  t.course_id,
  t.teaching_class_id,
  t.project_template_id,
  t.week_no,
  t.schedule_id,
  co.course_code,
  co.course_name,
  tc.class_code AS teaching_class_code,
  tc.class_name AS teaching_class_name,
  tm.name AS term_name,
  tm.id AS term_id,
  tpl.project_name AS template_project_name
`;

const TASK_CURRICULUM_JOINS = `
  LEFT JOIN courses co ON t.course_id = co.id
  LEFT JOIN teaching_classes tc ON t.teaching_class_id = tc.id
  LEFT JOIN terms tm ON tc.term_id = tm.id
  LEFT JOIN training_project_templates tpl ON t.project_template_id = tpl.id
`;

/** 教学班学生人数子查询 */
const TEACHING_CLASS_STUDENT_COUNT_SQL = `(SELECT COUNT(*) FROM teaching_class_students tcs WHERE tcs.teaching_class_id = t.teaching_class_id)`;

/** 行政班学生人数（旧任务） */
const LEGACY_CLASS_STUDENT_COUNT_SQL = `(SELECT COUNT(*) FROM users st WHERE st.class_id = t.class_id AND st.role = 'student')`;

function taskAudienceStudentCountSql() {
  return `CASE
    WHEN t.teaching_class_id IS NOT NULL THEN ${TEACHING_CLASS_STUDENT_COUNT_SQL}
    ELSE ${LEGACY_CLASS_STUDENT_COUNT_SQL}
  END AS classStudentCount`;
}

module.exports = {
  TASK_CURRICULUM_SELECT,
  TASK_CURRICULUM_JOINS,
  taskAudienceStudentCountSql,
};
