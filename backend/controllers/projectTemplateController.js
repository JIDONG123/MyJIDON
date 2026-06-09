const pool = require('../config/database');
const { parseId, trimOrNull, normalizeEvaluationMetrics } = require('../utils/curriculumHelpers');
const { teacherOwnsCourse, teacherManagesTeachingClass } = require('../utils/accessControl');
const { toMysqlDateTime } = require('../utils/mysqlDateTime');
const { safeNotify, notifyTeachingClassStudents } = require('../utils/notify');
const rt = require('../utils/realtimeEmit');

const tplSelectSql = `
  SELECT tpl.*, c.course_code, c.course_name, u.real_name AS creator_name
  FROM training_project_templates tpl
  INNER JOIN courses c ON c.id = tpl.course_id
  LEFT JOIN users u ON u.id = tpl.created_by
`;

async function assertCanManageTemplate(req, templateRow) {
  if (req.user.role === 'admin') return true;
  if (req.user.role !== 'teacher') return false;
  if (Number(templateRow.created_by) === Number(req.user.id)) return true;
  return teacherOwnsCourse(req.user.id, templateRow.course_id);
}

const listProjectTemplates = async (req, res) => {
  try {
    let sql = `${tplSelectSql} WHERE 1=1`;
    const params = [];
    const courseId = parseId(req.query.courseId || req.query.course_id);
    if (courseId) {
      sql += ' AND tpl.course_id = ?';
      params.push(courseId);
    }
    if (req.user.role === 'teacher') {
      sql += ` AND (
        tpl.created_by = ?
        OR c.leader_id = ?
        OR EXISTS (
          SELECT 1 FROM teaching_class_teachers tct
          INNER JOIN teaching_classes tc ON tc.id = tct.teaching_class_id
          WHERE tc.course_id = tpl.course_id AND tct.teacher_id = ?
        )
      )`;
      params.push(req.user.id, req.user.id, req.user.id);
    }
    sql += ' ORDER BY tpl.updated_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取项目模板失败', error: error.message });
  }
};

const getProjectTemplateById = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [rows] = await pool.query(`${tplSelectSql} WHERE tpl.id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '模板不存在' });
    const ok = await assertCanManageTemplate(req, rows[0]);
    if (!ok && req.user.role !== 'student') {
      return res.status(404).json({ success: false, message: '模板不存在' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取模板失败', error: error.message });
  }
};

const createProjectTemplate = async (req, res) => {
  try {
    const courseId = parseId(req.body.courseId || req.body.course_id);
    const projectName = trimOrNull(req.body.projectName || req.body.project_name, 200);
    if (!courseId || !projectName) {
      return res.status(400).json({ success: false, message: '课程与项目名称必填' });
    }
    if (req.user.role === 'teacher') {
      const ok = await teacherOwnsCourse(req.user.id, courseId);
      if (!ok) return res.status(403).json({ success: false, message: '无权在该课程下创建模板' });
    }
    const metricsJson = normalizeEvaluationMetrics(req.body.evaluationMetrics || req.body.evaluation_metrics);
    const [result] = await pool.query(
      `INSERT INTO training_project_templates
        (course_id, created_by, project_name, description, requirements, evaluation_metrics,
         enterprise_standard, suggested_materials, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        courseId,
        req.user.id,
        projectName,
        trimOrNull(req.body.description),
        trimOrNull(req.body.requirements),
        metricsJson,
        trimOrNull(req.body.enterpriseStandard || req.body.enterprise_standard),
        trimOrNull(req.body.suggestedMaterials || req.body.suggested_materials),
        req.body.status === 0 || req.body.status === '0' ? 0 : 1,
      ]
    );
    res.status(201).json({ success: true, message: '创建成功', id: result.insertId });
  } catch (error) {
    res.status(500).json({ success: false, message: '创建失败', error: error.message });
  }
};

const updateProjectTemplate = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [rows] = await pool.query('SELECT * FROM training_project_templates WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '模板不存在' });
    if (!(await assertCanManageTemplate(req, rows[0]))) {
      return res.status(403).json({ success: false, message: '无权修改该模板' });
    }
    const projectName = trimOrNull(req.body.projectName || req.body.project_name, 200);
    if (!projectName) return res.status(400).json({ success: false, message: '项目名称必填' });
    const metricsJson = normalizeEvaluationMetrics(req.body.evaluationMetrics || req.body.evaluation_metrics);
    await pool.query(
      `UPDATE training_project_templates SET project_name = ?, description = ?, requirements = ?,
        evaluation_metrics = ?, enterprise_standard = ?, suggested_materials = ?, status = ? WHERE id = ?`,
      [
        projectName,
        trimOrNull(req.body.description),
        trimOrNull(req.body.requirements),
        metricsJson,
        trimOrNull(req.body.enterpriseStandard || req.body.enterprise_standard),
        trimOrNull(req.body.suggestedMaterials || req.body.suggested_materials),
        req.body.status === 0 || req.body.status === '0' ? 0 : 1,
        id,
      ]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败', error: error.message });
  }
};

const deleteProjectTemplate = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [rows] = await pool.query('SELECT * FROM training_project_templates WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '模板不存在' });
    if (!(await assertCanManageTemplate(req, rows[0]))) {
      return res.status(403).json({ success: false, message: '无权删除该模板' });
    }
    await pool.query('DELETE FROM training_project_templates WHERE id = ?', [id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
};

/** 从模板一键生成教学班实训任务 */
const spawnTaskFromTemplate = async (req, res) => {
  try {
    const templateId = parseId(req.params.id);
    const teachingClassId = parseId(req.body.teachingClassId || req.body.teaching_class_id);
    const deadlineRaw = req.body.deadline;
    if (!teachingClassId || !deadlineRaw) {
      return res.status(400).json({ success: false, message: '教学班与截止时间必填' });
    }
    const deadlineMysql = toMysqlDateTime(deadlineRaw);
    if (!deadlineMysql) {
      return res.status(400).json({ success: false, message: '截止时间无效' });
    }

    const [tplRows] = await pool.query('SELECT * FROM training_project_templates WHERE id = ?', [templateId]);
    if (!tplRows.length) return res.status(404).json({ success: false, message: '模板不存在' });
    const tpl = tplRows[0];
    if (!(await assertCanManageTemplate(req, tpl))) {
      return res.status(403).json({ success: false, message: '无权使用该模板' });
    }

    const [tcRows] = await pool.query(
      'SELECT id, course_id FROM teaching_classes WHERE id = ?',
      [teachingClassId]
    );
    if (!tcRows.length) return res.status(400).json({ success: false, message: '教学班不存在' });
    if (Number(tcRows[0].course_id) !== Number(tpl.course_id)) {
      return res.status(400).json({ success: false, message: '模板与教学班课程不一致' });
    }

    if (req.user.role === 'teacher') {
      const ok = await teacherManagesTeachingClass(req.user.id, teachingClassId);
      if (!ok) return res.status(403).json({ success: false, message: '无权向该教学班发布任务' });
    }

    const title = trimOrNull(req.body.title, 200) || tpl.project_name;
    const weekNo = parseId(req.body.weekNo || req.body.week_no);
    const scheduleId = parseId(req.body.scheduleId || req.body.schedule_id);

    const [result] = await pool.query(
      `INSERT INTO tasks (
        title, description, requirements, scoring_criteria, scenario_type, enterprise_standard,
        evaluation_metrics, deadline, class_id, course_id, teaching_class_id, project_template_id,
        week_no, schedule_id, is_public, max_score, max_submissions, created_by
      ) VALUES (?, ?, ?, ?, 'mixed', ?, ?, ?, NULL, ?, ?, ?, ?, ?, 0, ?, 1, ?)`,
      [
        title,
        tpl.description,
        tpl.requirements,
        tpl.suggested_materials,
        tpl.enterprise_standard,
        tpl.evaluation_metrics,
        deadlineMysql,
        tpl.course_id,
        teachingClassId,
        templateId,
        weekNo,
        scheduleId,
        Number(req.body.maxScore || req.body.max_score) || 100,
        req.user.id,
      ]
    );

    const taskId = result.insertId;
    if (scheduleId) {
      await pool.query('UPDATE course_schedules SET task_id = ? WHERE id = ? AND teaching_class_id = ?', [
        taskId,
        scheduleId,
        teachingClassId,
      ]);
    }

    safeNotify(
      notifyTeachingClassStudents(Number(teachingClassId), {
        type: 'task_published',
        title: '新实训任务发布',
        body: `任务「${title}」已发布，请及时查看并提交。`,
        refType: 'task',
        refId: taskId,
      })
    );

    try {
      rt.emitTasksMutate(Number(teachingClassId), taskId, 'create');
    } catch {
      /* ignore */
    }

    res.status(201).json({ success: true, message: '任务已生成', taskId });
  } catch (error) {
    res.status(500).json({ success: false, message: '生成任务失败', error: error.message });
  }
};

module.exports = {
  listProjectTemplates,
  getProjectTemplateById,
  createProjectTemplate,
  updateProjectTemplate,
  deleteProjectTemplate,
  spawnTaskFromTemplate,
};
