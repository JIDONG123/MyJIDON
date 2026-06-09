const pool = require('../config/database');
const {
  buildPracticeScoresWorkbook,
  exportAccountLabel,
} = require('./practiceScoresExport');
const { formatDateTime } = require('./exportFormatters');

const ROSTER_SELECT = `
  u.real_name, u.student_no, u.username,
  lc.class_name AS admin_class_name,
  s.id AS submission_id, s.submitted_at,
  gr.status, gr.final_score, gr.total_score, gr.human_score, gr.enterprise_score,
  t.title AS task_title,
  co.course_name, tc.class_name AS teaching_class_name, tm.name AS term_name,
  tpl.project_name
`;

async function fetchTaskRosterRows(taskId, isTeaching, audienceId) {
  let rosterSql;
  let rosterParams;
  if (isTeaching) {
    rosterSql = `
      SELECT ${ROSTER_SELECT}
      FROM users u
      INNER JOIN teaching_class_students tcs ON tcs.student_id = u.id AND tcs.teaching_class_id = ?
      LEFT JOIN submissions s ON s.student_id = u.id AND s.task_id = ?
      LEFT JOIN grading_results gr ON gr.submission_id = s.id
      LEFT JOIN tasks t ON t.id = ?
      LEFT JOIN classes lc ON u.class_id = lc.id
      LEFT JOIN courses co ON t.course_id = co.id
      LEFT JOIN teaching_classes tc ON t.teaching_class_id = tc.id
      LEFT JOIN terms tm ON tc.term_id = tm.id
      LEFT JOIN training_project_templates tpl ON t.project_template_id = tpl.id
      WHERE u.role = 'student'
      ORDER BY u.student_no, u.username
    `;
    rosterParams = [audienceId, taskId, taskId];
  } else {
    rosterSql = `
      SELECT ${ROSTER_SELECT}
      FROM users u
      LEFT JOIN submissions s ON s.student_id = u.id AND s.task_id = ?
      LEFT JOIN grading_results gr ON gr.submission_id = s.id
      LEFT JOIN tasks t ON t.id = ?
      LEFT JOIN classes lc ON u.class_id = lc.id
      LEFT JOIN courses co ON t.course_id = co.id
      LEFT JOIN teaching_classes tc ON t.teaching_class_id = tc.id
      LEFT JOIN terms tm ON tc.term_id = tm.id
      LEFT JOIN training_project_templates tpl ON t.project_template_id = tpl.id
      WHERE u.class_id = ? AND u.role = 'student'
      ORDER BY u.student_no, u.username
    `;
    rosterParams = [taskId, taskId, audienceId];
  }
  const [rows] = await pool.query(rosterSql, rosterParams);
  return rows;
}

function compositeScore(row) {
  if (row.final_score != null && row.final_score !== '') return row.final_score;
  if (row.human_score != null && row.human_score !== '') return row.human_score;
  if (row.total_score != null && row.total_score !== '') return row.total_score;
  return null;
}

function normalizeTaskRosterRow(row) {
  const hasSubmission = row.submission_id != null;
  return {
    studentName: row.real_name,
    studentNo: row.student_no,
    adminClassName: row.admin_class_name,
    courseName: row.course_name,
    teachingClassName: row.teaching_class_name,
    termName: row.term_name,
    projectName: row.project_name,
    taskName: row.task_title,
    aiScore: hasSubmission ? row.total_score : null,
    humanScore: hasSubmission ? row.human_score : null,
    enterpriseScore: hasSubmission ? row.enterprise_score : null,
    finalScore: hasSubmission ? compositeScore(row) : null,
    status: hasSubmission ? row.status : null,
    submittedAt: hasSubmission ? row.submitted_at : null,
    hasSubmission,
  };
}

async function resolveTaskExportLabel(task, isTeaching, audienceId) {
  const title = task?.title || `任务#${task?.id ?? ''}`;
  if (isTeaching) {
    const [rows] = await pool.query(
      `SELECT tc.class_name, c.course_name
       FROM teaching_classes tc
       INNER JOIN courses c ON c.id = tc.course_id
       WHERE tc.id = ?`,
      [audienceId]
    );
    if (!rows.length) return `任务：${title} · 教学班（ID ${audienceId}）`;
    return `任务：${title} · 教学班：${rows[0].course_name} · ${rows[0].class_name}`;
  }
  const [rows] = await pool.query('SELECT class_name FROM classes WHERE id = ?', [audienceId]);
  if (!rows.length) return `任务：${title} · 行政班（ID ${audienceId}）`;
  return `任务：${title} · 行政班：${rows[0].class_name}`;
}

function buildTaskScoresWorkbook(rows, meta) {
  const normalized = rows.map(normalizeTaskRosterRow);
  return buildPracticeScoresWorkbook(normalized, meta, {
    detailSheetName: '成绩明细',
    summarySheetName: '统计摘要',
  });
}

module.exports = {
  normalizeTaskRosterRow,
  resolveTaskExportLabel,
  buildTaskScoresWorkbook,
  exportAccountLabel,
  fetchTaskRosterRows,
  ROSTER_SELECT,
};
