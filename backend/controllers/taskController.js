const pool = require('../config/database');
const { toMysqlDateTime } = require('../utils/mysqlDateTime');
const cache = require('../utils/cacheService');
const {
  parseTaskCodeRunConfig,
  normalizeTaskCodeRunInput,
} = require('../utils/taskCodeRunConfig');
const {
  getStudentClassId,
  getStudentTeachingClassIds,
  teacherManagesClass,
  teacherManagesTeachingClass,
  teacherCanViewTask,
  getTaskRow,
  teacherTaskVisibilityWhere,
  teacherTaskVisibilityParams,
  studentCanAccessTask,
  enterpriseHasClassAccess,
  enterpriseCanAccessTask,
} = require('../utils/accessControl');
const { safeNotify, notifyClassStudents, notifyTeachingClassStudents } = require('../utils/notify');
const {
  TASK_CURRICULUM_SELECT,
  TASK_CURRICULUM_JOINS,
  taskAudienceStudentCountSql,
} = require('../utils/curriculumQuery');
const { parseId } = require('../utils/curriculumHelpers');
const rt = require('../utils/realtimeEmit');

async function bumpTaskRelatedCaches(taskId, createdBy) {
  try {
    await cache.invalidateTaskDetail(taskId);
    await cache.invalidateDashboardAllCommon();
    if (createdBy != null) {
      await cache.invalidateDashboard('teacher', createdBy);
    }
  } catch {
    /* ignore */
  }
}

/** 任务允许学生成功提交的最大次数，正整数，默认 1 */
function normalizeMaxSubmissions(raw) {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 9999);
}

const getAllTasks = async (req, res) => {
  try {
    const { classId } = req.query;
    const role = req.user.role;
    const uid = req.user.id;

    let query = `
      SELECT t.id, t.title, t.description, t.requirements, t.scoring_criteria, t.scenario_type, t.enterprise_standard,
             t.evaluation_metrics,
             t.deadline, t.class_id, c.class_name, t.is_public, t.max_score, t.max_submissions,
             t.score_ai_weight, t.score_human_weight,
             t.campus_grade_weight, t.enterprise_grade_weight, t.step_checklist, t.difficulty_level,
             t.created_by, u.real_name as creator_name, t.created_at,
             ${TASK_CURRICULUM_SELECT},
             (SELECT COUNT(*) FROM submissions s WHERE s.task_id = t.id) AS submissionCount,
             ${taskAudienceStudentCountSql()},
             (SELECT COUNT(DISTINCT s2.student_id) FROM submissions s2 WHERE s2.task_id = t.id) AS submittedStudentCount
      FROM tasks t
      LEFT JOIN classes c ON t.class_id = c.id
      ${TASK_CURRICULUM_JOINS}
      LEFT JOIN users u ON t.created_by = u.id
    `;

    const params = [];
    const where = [];

    if (role === 'teacher') {
      where.push(teacherTaskVisibilityWhere('t'));
      params.push(...teacherTaskVisibilityParams(uid));
    } else if (role === 'student') {
      const scid = await getStudentClassId(uid);
      const tcIds = await getStudentTeachingClassIds(uid);
      if (!scid && !tcIds.length) {
        return res.json({ success: true, data: [] });
      }
      const vis = [];
      if (scid) {
        vis.push('t.class_id = ?');
        params.push(scid);
      }
      if (tcIds.length) {
        vis.push(`t.teaching_class_id IN (${tcIds.map(() => '?').join(',')})`);
        params.push(...tcIds);
      }
      where.push(`(${vis.join(' OR ')})`);
    } else if (role === 'admin') {
      if (classId) {
        where.push('t.class_id = ?');
        params.push(classId);
      }
      const teachingClassId = parseId(req.query.teachingClassId || req.query.teaching_class_id);
      if (teachingClassId) {
        where.push('t.teaching_class_id = ?');
        params.push(teachingClassId);
      }
      const courseId = parseId(req.query.courseId || req.query.course_id);
      if (courseId) {
        where.push('t.course_id = ?');
        params.push(courseId);
      }
    } else if (role === 'enterprise') {
      where.push(`(
        (t.class_id IS NOT NULL AND t.class_id IN (
          SELECT class_id FROM enterprise_class_access WHERE enterprise_user_id = ?
        ))
        OR (t.teaching_class_id IS NOT NULL AND t.teaching_class_id IN (
          SELECT teaching_class_id FROM enterprise_teaching_class_access WHERE enterprise_user_id = ?
        ))
      )`);
      params.push(uid, uid);
    }

    if (role === 'teacher') {
      const teachingClassId = parseId(req.query.teachingClassId || req.query.teaching_class_id);
      if (teachingClassId) {
        where.push('t.teaching_class_id = ?');
        params.push(teachingClassId);
      }
    }

    if (where.length) {
      query += ` WHERE ${where.join(' AND ')}`;
    }

    query += ' ORDER BY t.created_at DESC';

    const [tasks] = await pool.query(query, params);

    if (role === 'student' && tasks.length) {
      const ids = tasks.map((t) => t.id);
      const ph = ids.map(() => '?').join(',');
      const [subs] = await pool.query(
        `SELECT task_id FROM submissions WHERE student_id = ? AND task_id IN (${ph})`,
        [uid, ...ids]
      );
      const done = new Set(subs.map((s) => s.task_id));
      for (const t of tasks) {
        t.completed = done.has(t.id) ? 1 : 0;
      }
    }

    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取任务列表失败', error: error.message });
  }
};

const getTaskById = async (req, res) => {
  try {
    const role = req.user.role;
    const uid = req.user.id;
    const taskId = req.params.id;
    const ckey = cache.kTaskDetail(taskId, role, uid);
    const hit = await cache.getJson(ckey);
    if (hit) {
      return res.json(hit);
    }

    const [tasks] = await pool.query(
      `
      SELECT t.id, t.title, t.description, t.requirements, t.scoring_criteria, t.scenario_type, t.enterprise_standard,
             t.evaluation_metrics,
             t.deadline, t.class_id, c.class_name, t.is_public, t.max_score, t.max_submissions,
             t.score_ai_weight, t.score_human_weight,
             t.campus_grade_weight, t.enterprise_grade_weight, t.step_checklist, t.difficulty_level,
             t.code_run_enabled, t.code_run_language, t.code_run_config,
             t.created_by, u.real_name as creator_name,
             ${TASK_CURRICULUM_SELECT}
      FROM tasks t
      LEFT JOIN classes c ON t.class_id = c.id
      ${TASK_CURRICULUM_JOINS}
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = ?
    `,
      [taskId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    const row = tasks[0];
    if (row.code_run_config && typeof row.code_run_config === 'string') {
      try {
        row.code_run_config = JSON.parse(row.code_run_config);
      } catch {
        row.code_run_config = null;
      }
    }
    row.codeRunConfig = parseTaskCodeRunConfig(row.code_run_config);

    if (role === 'student') {
      const ok = await studentCanAccessTask(uid, taskId);
      if (!ok) {
        return res.status(404).json({ success: false, message: '任务不存在' });
      }
      const [subs] = await pool.query(
        'SELECT id, revised_count FROM submissions WHERE task_id = ? AND student_id = ? LIMIT 1',
        [taskId, uid]
      );
      row.completed = subs.length > 0 ? 1 : 0;
      const maxSub = normalizeMaxSubmissions(row.max_submissions);
      row.max_submissions = maxSub;
      if (subs.length > 0) {
        row.submit_count = Number(subs[0].revised_count) + 1;
      } else {
        row.submit_count = 0;
      }
      row.submit_remaining = Math.max(0, maxSub - row.submit_count);
      const { loadActiveResubmitPermission } = require('../services/submissionResubmitService');
      const perm = await loadActiveResubmitPermission({
        taskId,
        studentId: uid,
        submissionId: subs[0]?.id ?? null,
      });
      row.has_resubmit_permission = Boolean(perm);
      row.resubmit_expire_at = perm?.expire_at || null;
      if (perm && row.submit_remaining <= 0) {
        row.submit_remaining = Math.max(0, Number(perm.extra_attempts) - Number(perm.used_attempts));
      }
    } else if (role === 'teacher') {
      const ok = await teacherCanViewTask(uid, taskId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权查看该任务' });
      }
      const [[sc]] = await pool.query(
        `SELECT COUNT(DISTINCT s.student_id) AS sub_n,
                ${taskAudienceStudentCountSql().replace(' AS classStudentCount', '')} AS stu_n
         FROM tasks t
         LEFT JOIN submissions s ON s.task_id = t.id
         WHERE t.id = ?`,
        [taskId]
      );
      row.submittedStudentCount = sc.sub_n;
      row.classStudentCount = sc.stu_n;
    } else if (role === 'enterprise') {
      const t = await enterpriseCanAccessTask(uid, taskId);
      if (!t) {
        return res.status(404).json({ success: false, message: '任务不存在' });
      }
    }

    const payload = { success: true, data: row };
    await cache.setJson(ckey, payload, cache.TTL.taskDetail);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: '获取任务信息失败', error: error.message });
  }
};

function normalizeEvaluationMetrics(raw) {
  if (raw == null || raw === '') return null;
  let arr = raw;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return JSON.stringify(
    arr.map((x) => ({
      name: String(x.name || '').trim() || '指标',
      weight: Number(x.weight) || 0,
      maxScore: Number(x.maxScore != null ? x.maxScore : x.weight) || 0,
    }))
  );
}

function normalizeScenarioType(v) {
  const allowed = ['teaching', 'enterprise_collab', 'mixed'];
  if (v && allowed.includes(v)) return v;
  return 'mixed';
}

function normalizeTaskScoreWeights(scoreAiWeight, scoreHumanWeight) {
  const a =
    scoreAiWeight === null || scoreAiWeight === undefined || scoreAiWeight === '' ? null : Number(scoreAiWeight);
  const h =
    scoreHumanWeight === null || scoreHumanWeight === undefined || scoreHumanWeight === ''
      ? null
      : Number(scoreHumanWeight);
  if (a === null || h === null || Number.isNaN(a) || Number.isNaN(h)) {
    return [null, null];
  }
  return [a, h];
}

function normalizeDualGradeWeights(campusGradeWeight, enterpriseGradeWeight) {
  const c =
    campusGradeWeight === undefined || campusGradeWeight === null || campusGradeWeight === ''
      ? 50
      : Number(campusGradeWeight);
  const e =
    enterpriseGradeWeight === undefined || enterpriseGradeWeight === null || enterpriseGradeWeight === ''
      ? 50
      : Number(enterpriseGradeWeight);
  if (Number.isNaN(c) || Number.isNaN(e)) {
    return { ok: false, message: '校企评分权重须为数字' };
  }
  if (Math.abs(c + e - 100) > 0.02) {
    return { ok: false, message: '校内评分权重与企业评分权重之和须为 100%' };
  }
  return { ok: true, campus: c, enterprise: e };
}

function normalizeStepChecklistJson(raw) {
  if (raw == null || raw === '') return null;
  let arr = raw;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return JSON.stringify(
    arr.map((x, i) => ({
      id: x.id != null ? x.id : i + 1,
      title: String(x.title || x.name || '').trim() || `步骤${i + 1}`,
      required: Boolean(x.required),
    }))
  );
}

function normalizeDifficultyLevel(v) {
  const allowed = ['basic', 'standard', 'advanced'];
  if (v && allowed.includes(v)) return v;
  return 'standard';
}

const createTask = async (req, res) => {
  try {
    const {
      title,
      description,
      requirements,
      scoringCriteria,
      scenarioType,
      enterpriseStandard,
      evaluationMetrics,
      deadline,
      classId: classIdRaw,
      teachingClassId: teachingClassIdRaw,
      courseId: courseIdRaw,
      projectTemplateId: projectTemplateIdRaw,
      weekNo: weekNoRaw,
      scheduleId: scheduleIdRaw,
      maxScore,
      scoreAiWeight,
      scoreHumanWeight,
      campusGradeWeight,
      enterpriseGradeWeight,
      stepChecklist,
      difficultyLevel,
      maxSubmissions,
      codeRunEnabled,
      codeRunLanguage,
      codeRunTimeoutSec,
      codeRunGradeAfterRun,
      codeRunEntryFile,
      codeRunStdin,
    } = req.body;

    const codeRunFields = normalizeTaskCodeRunInput({
      codeRunEnabled,
      codeRunLanguage,
      codeRunTimeoutSec,
      codeRunGradeAfterRun,
      codeRunEntryFile,
      codeRunStdin,
      code_run_enabled: req.body.code_run_enabled,
      code_run_language: req.body.code_run_language,
      code_run_config: req.body.code_run_config,
    });
    if (codeRunFields.error) {
      return res.status(400).json({ success: false, message: codeRunFields.error });
    }

    const classId = classIdRaw ? Number(classIdRaw) : null;
    const teachingClassId = parseId(teachingClassIdRaw || req.body.teaching_class_id);
    let courseId = parseId(courseIdRaw || req.body.course_id);
    const projectTemplateId = parseId(projectTemplateIdRaw || req.body.project_template_id);
    const weekNo = parseId(weekNoRaw || req.body.week_no);
    const scheduleId = parseId(scheduleIdRaw || req.body.schedule_id);

    if (!classId && !teachingClassId) {
      return res.status(400).json({ success: false, message: '请选择发布班级或教学班' });
    }
    if (classId && teachingClassId) {
      return res.status(400).json({ success: false, message: '请勿同时绑定行政班与教学班' });
    }

    const deadlineMysql = toMysqlDateTime(deadline);
    if (!deadlineMysql) {
      return res.status(400).json({ success: false, message: '截止时间无效，请重新选择' });
    }

    const maxSubmissionsNorm = normalizeMaxSubmissions(maxSubmissions);

    if (teachingClassId) {
      if (req.user.role === 'teacher') {
        const ok = await teacherManagesTeachingClass(req.user.id, teachingClassId);
        if (!ok) {
          return res.status(403).json({ success: false, message: '只能向自己负责的教学班发布任务' });
        }
      }
      const [tcRows] = await pool.query('SELECT course_id FROM teaching_classes WHERE id = ?', [teachingClassId]);
      if (!tcRows.length) {
        return res.status(400).json({ success: false, message: '教学班不存在' });
      }
      if (!courseId) courseId = tcRows[0].course_id;
    } else if (req.user.role === 'teacher') {
      const ok = await teacherManagesClass(req.user.id, classId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '只能向自己负责的班级发布任务' });
      }
    }

    const metricsJson = normalizeEvaluationMetrics(evaluationMetrics);
    const [wAi, wHuman] = normalizeTaskScoreWeights(scoreAiWeight, scoreHumanWeight);
    const scenario = normalizeScenarioType(scenarioType);
    const entStd =
      enterpriseStandard != null && String(enterpriseStandard).trim() !== ''
        ? String(enterpriseStandard).trim()
        : null;
    const dual = normalizeDualGradeWeights(campusGradeWeight, enterpriseGradeWeight);
    if (!dual.ok) {
      return res.status(400).json({ success: false, message: dual.message });
    }
    const stepJson = normalizeStepChecklistJson(stepChecklist);
    const diffLv = normalizeDifficultyLevel(difficultyLevel);

    const [result] = await pool.query(
      `INSERT INTO tasks (
        title, description, requirements, scoring_criteria, scenario_type, enterprise_standard, evaluation_metrics,
        deadline, class_id, course_id, teaching_class_id, project_template_id, week_no, schedule_id,
        is_public, max_score, max_submissions, score_ai_weight, score_human_weight,
        campus_grade_weight, enterprise_grade_weight, step_checklist, difficulty_level,
        code_run_enabled, code_run_language, code_run_config, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        description,
        requirements,
        scoringCriteria,
        scenario,
        entStd,
        metricsJson,
        deadlineMysql,
        classId,
        courseId,
        teachingClassId,
        projectTemplateId,
        weekNo,
        scheduleId,
        maxScore || 100,
        maxSubmissionsNorm,
        wAi,
        wHuman,
        dual.campus,
        dual.enterprise,
        stepJson,
        diffLv,
        codeRunFields.enabled,
        codeRunFields.language,
        codeRunFields.configJson,
        req.user.id,
      ]
    );

    const newTaskId = result.insertId;
    if (classId) {
      safeNotify(
        notifyClassStudents(Number(classId), {
          type: 'task_published',
          title: '新实训任务发布',
          body: `任务「${title}」已发布，请及时查看并提交。`,
          refType: 'task',
          refId: newTaskId,
        })
      );
      try {
        rt.emitTasksMutate(Number(classId), newTaskId, 'create');
      } catch {
        /* ignore */
      }
    }
    if (teachingClassId) {
      safeNotify(
        notifyTeachingClassStudents(Number(teachingClassId), {
          type: 'task_published',
          title: '新实训任务发布',
          body: `任务「${title}」已发布，请及时查看并提交。`,
          refType: 'task',
          refId: newTaskId,
        })
      );
      try {
        rt.emitTasksMutate(Number(teachingClassId), newTaskId, 'create');
      } catch {
        /* ignore */
      }
    }

    await bumpTaskRelatedCaches(newTaskId, req.user.id);
    res.status(201).json({ success: true, message: '任务创建成功', taskId: newTaskId });
  } catch (error) {
    res.status(500).json({ success: false, message: '创建失败', error: error.message });
  }
};

const updateTask = async (req, res) => {
  try {
    const taskId = req.params.id;
    const existing = await getTaskRow(taskId);
    if (!existing) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    if (req.user.role === 'teacher') {
      if (existing.created_by !== req.user.id) {
        return res.status(403).json({ success: false, message: '无权修改该任务' });
      }
    }

    const {
      title,
      description,
      requirements,
      scoringCriteria,
      scenarioType,
      enterpriseStandard,
      evaluationMetrics,
      deadline,
      classId: classIdRaw,
      teachingClassId: teachingClassIdRaw,
      courseId: courseIdRaw,
      projectTemplateId: projectTemplateIdRaw,
      weekNo: weekNoRaw,
      scheduleId: scheduleIdRaw,
      maxScore,
      scoreAiWeight,
      scoreHumanWeight,
      campusGradeWeight,
      enterpriseGradeWeight,
      stepChecklist,
      difficultyLevel,
      maxSubmissions,
      codeRunEnabled,
      codeRunLanguage,
      codeRunTimeoutSec,
      codeRunGradeAfterRun,
      codeRunEntryFile,
      codeRunStdin,
    } = req.body;

    const codeRunFields = normalizeTaskCodeRunInput({
      codeRunEnabled,
      codeRunLanguage,
      codeRunTimeoutSec,
      codeRunGradeAfterRun,
      codeRunEntryFile,
      codeRunStdin,
      code_run_enabled: req.body.code_run_enabled,
      code_run_language: req.body.code_run_language,
      code_run_config: req.body.code_run_config,
    });
    if (codeRunFields.error) {
      return res.status(400).json({ success: false, message: codeRunFields.error });
    }

    const isTeachingTask = Boolean(existing.teaching_class_id);
    const classId = isTeachingTask ? null : classIdRaw ? Number(classIdRaw) : existing.class_id;
    const teachingClassId = isTeachingTask
      ? parseId(teachingClassIdRaw || req.body.teaching_class_id) || existing.teaching_class_id
      : null;
    const courseId = parseId(courseIdRaw || req.body.course_id) || existing.course_id || null;
    const projectTemplateId =
      parseId(projectTemplateIdRaw || req.body.project_template_id) || existing.project_template_id || null;
    const weekNo = parseId(weekNoRaw || req.body.week_no) ?? existing.week_no;
    const scheduleId = parseId(scheduleIdRaw || req.body.schedule_id) ?? existing.schedule_id;

    if (!isTeachingTask && !classId) {
      return res.status(400).json({ success: false, message: '请选择发布班级' });
    }
    if (isTeachingTask && !teachingClassId) {
      return res.status(400).json({ success: false, message: '教学班无效' });
    }

    const deadlineMysql = toMysqlDateTime(deadline);
    if (!deadlineMysql) {
      return res.status(400).json({ success: false, message: '截止时间无效，请重新选择' });
    }

    const maxSubmissionsNorm = normalizeMaxSubmissions(maxSubmissions);

    if (req.user.role === 'teacher') {
      if (Number(existing.created_by) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: '无权修改该任务' });
      }
      if (isTeachingTask) {
        const tcOk = await teacherManagesTeachingClass(req.user.id, teachingClassId);
        if (!tcOk) {
          return res.status(403).json({ success: false, message: '只能指定自己负责的教学班' });
        }
      } else {
        const okClass = await teacherManagesClass(req.user.id, classId);
        if (!okClass) {
          return res.status(403).json({ success: false, message: '只能指定自己负责的班级' });
        }
      }
    }

    const metricsJson = normalizeEvaluationMetrics(evaluationMetrics);
    const [wAi, wHuman] = normalizeTaskScoreWeights(scoreAiWeight, scoreHumanWeight);
    const scenario = normalizeScenarioType(scenarioType);
    const entStd =
      enterpriseStandard != null && String(enterpriseStandard).trim() !== ''
        ? String(enterpriseStandard).trim()
        : null;
    const dual = normalizeDualGradeWeights(campusGradeWeight, enterpriseGradeWeight);
    if (!dual.ok) {
      return res.status(400).json({ success: false, message: dual.message });
    }
    const stepJson = normalizeStepChecklistJson(stepChecklist);
    const diffLv = normalizeDifficultyLevel(difficultyLevel);

    await pool.query(
      `UPDATE tasks SET title = ?, description = ?, requirements = ?, scoring_criteria = ?, scenario_type = ?, enterprise_standard = ?, evaluation_metrics = ?,
        deadline = ?, class_id = ?, course_id = ?, teaching_class_id = ?, project_template_id = ?, week_no = ?, schedule_id = ?,
        is_public = 0, max_score = ?, max_submissions = ?, score_ai_weight = ?, score_human_weight = ?,
        campus_grade_weight = ?, enterprise_grade_weight = ?, step_checklist = ?, difficulty_level = ?,
        code_run_enabled = ?, code_run_language = ?, code_run_config = ?
        WHERE id = ?`,
      [
        title,
        description,
        requirements,
        scoringCriteria,
        scenario,
        entStd,
        metricsJson,
        deadlineMysql,
        classId,
        courseId,
        teachingClassId,
        projectTemplateId,
        weekNo,
        scheduleId,
        maxScore || 100,
        maxSubmissionsNorm,
        wAi,
        wHuman,
        dual.campus,
        dual.enterprise,
        stepJson,
        diffLv,
        codeRunFields.enabled,
        codeRunFields.language,
        codeRunFields.configJson,
        taskId,
      ]
    );

    await bumpTaskRelatedCaches(taskId, existing.created_by);
    try {
      const { clearTaskGradingContextCache } = require('../utils/gradingTaskContextCache');
      const { clearGradingRagCacheForTeacher } = require('../utils/gradingRagCache');
      await clearTaskGradingContextCache(taskId);
      await clearGradingRagCacheForTeacher(existing.created_by);
    } catch {
      /* ignore */
    }
    try {
      const emitId = teachingClassId || classId;
      if (emitId) rt.emitTasksMutate(Number(emitId), Number(taskId), 'update');
    } catch {
      /* ignore */
    }
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败', error: error.message });
  }
};

const deleteTask = async (req, res) => {
  try {
    const existing = await getTaskRow(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }
    if (req.user.role === 'teacher' && existing.created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: '无权删除该任务' });
    }

    await pool.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    await bumpTaskRelatedCaches(req.params.id, existing.created_by);
    try {
      rt.emitTasksMutate(Number(existing.class_id), Number(req.params.id), 'delete');
    } catch {
      /* ignore */
    }
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
};

/** 教学班任务列表（学生/教师/企业/管理员） */
const getTasksByTeachingClass = async (req, res) => {
  try {
    const teachingClassId = Number(req.params.teachingClassId);
    const role = req.user.role;
    const uid = req.user.id;

    if (role === 'student') {
      const tcIds = await getStudentTeachingClassIds(uid);
      if (!tcIds.includes(teachingClassId)) {
        return res.status(403).json({ success: false, message: '无权查看该教学班任务' });
      }
      const [tasks] = await pool.query(
        `
        SELECT t.id, t.title, t.description, t.deadline, t.max_score, t.max_submissions, t.created_at,
               tc.class_name AS teaching_class_name, co.course_name,
               CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS completed,
               s.id AS my_submission_id
        FROM tasks t
        LEFT JOIN teaching_classes tc ON t.teaching_class_id = tc.id
        LEFT JOIN courses co ON t.course_id = co.id
        LEFT JOIN submissions s ON s.task_id = t.id AND s.student_id = ?
        WHERE t.teaching_class_id = ?
        ORDER BY t.deadline ASC
      `,
        [uid, teachingClassId]
      );
      return res.json({ success: true, data: tasks });
    }

    if (role === 'enterprise') {
      const { enterpriseHasTeachingClassAccess } = require('../utils/accessControl');
      const ok = await enterpriseHasTeachingClassAccess(uid, teachingClassId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权查看该教学班任务' });
      }
      const [tasks] = await pool.query(
        `
        SELECT t.id, t.title, t.description, t.deadline, t.max_score, t.created_at, t.created_by,
               t.campus_grade_weight, t.enterprise_grade_weight, t.difficulty_level,
               tc.class_name AS teaching_class_name, co.course_name
        FROM tasks t
        LEFT JOIN teaching_classes tc ON t.teaching_class_id = tc.id
        LEFT JOIN courses co ON t.course_id = co.id
        WHERE t.teaching_class_id = ?
        ORDER BY t.deadline ASC
      `,
        [teachingClassId]
      );
      return res.json({ success: true, data: tasks });
    }

    if (role === 'teacher') {
      const ok = await teacherManagesTeachingClass(uid, teachingClassId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权查看该教学班任务' });
      }
    }

    const [tasks] = await pool.query(
      `
      SELECT t.id, t.title, t.description, t.deadline, t.max_score, t.created_at, t.created_by,
             (SELECT COUNT(*) FROM teaching_class_students tcs WHERE tcs.teaching_class_id = t.teaching_class_id) AS classStudentCount,
             (SELECT COUNT(DISTINCT s2.student_id) FROM submissions s2 WHERE s2.task_id = t.id) AS submittedStudentCount,
             tc.class_name AS teaching_class_name, co.course_name
      FROM tasks t
      LEFT JOIN teaching_classes tc ON t.teaching_class_id = tc.id
      LEFT JOIN courses co ON t.course_id = co.id
      WHERE t.teaching_class_id = ?${role === 'teacher' ? ' AND t.created_by = ?' : ''}
      ORDER BY t.deadline ASC
    `,
      role === 'teacher' ? [teachingClassId, uid] : [teachingClassId]
    );

    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取教学班任务失败', error: error.message });
  }
};

/** 学生：行政班 legacy 任务 + 本人完成状态；教师/管理员：校验班级访问权限
 *  Legacy API：仅返回 class_id 匹配且 teaching_class_id IS NULL 的行政班任务。
 *  新学生端实训中心请优先使用 GET /api/tasks；本接口仍供档案筛选、教师导出、知识图谱等场景使用。
 */
const getTasksByClass = async (req, res) => {
  try {
    const classId = Number(req.params.classId);
    const role = req.user.role;
    const uid = req.user.id;

    if (role === 'student') {
      const scid = await getStudentClassId(uid);
      if (scid == null || Number(scid) !== Number(classId)) {
        return res.status(403).json({ success: false, message: '无权查看该班级任务' });
      }
      const [tasks] = await pool.query(
        `
        SELECT t.id, t.title, t.description, t.deadline, t.max_score, t.max_submissions, t.created_at,
               CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS completed,
               s.id AS my_submission_id
        FROM tasks t
        LEFT JOIN submissions s ON s.task_id = t.id AND s.student_id = ?
        WHERE t.class_id = ? AND t.teaching_class_id IS NULL
        ORDER BY t.deadline ASC
      `,
        [uid, classId]
      );
      return res.json({ success: true, data: tasks });
    }

    if (role === 'enterprise') {
      const ok = await enterpriseHasClassAccess(uid, classId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权查看该班级任务' });
      }
      const [tasks] = await pool.query(
        `
        SELECT t.id, t.title, t.description, t.deadline, t.max_score, t.created_at, t.created_by,
               t.campus_grade_weight, t.enterprise_grade_weight, t.difficulty_level
        FROM tasks t
        WHERE t.class_id = ? AND t.teaching_class_id IS NULL
        ORDER BY t.deadline ASC
      `,
        [classId]
      );
      return res.json({ success: true, data: tasks });
    }

    if (role === 'teacher') {
      const ok = await teacherManagesClass(uid, classId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权查看该班级任务' });
      }
    }

    const [tasks] = await pool.query(
      `
      SELECT t.id, t.title, t.description, t.deadline, t.max_score, t.created_at, t.created_by,
             (SELECT COUNT(*) FROM users st WHERE st.class_id = t.class_id AND st.role = 'student') AS classStudentCount,
             (SELECT COUNT(DISTINCT s2.student_id) FROM submissions s2 WHERE s2.task_id = t.id) AS submittedStudentCount
      FROM tasks t
      WHERE t.class_id = ? AND t.teaching_class_id IS NULL${role === 'teacher' ? ' AND t.created_by = ?' : ''}
      ORDER BY t.deadline ASC
    `,
      role === 'teacher' ? [classId, uid] : [classId]
    );

    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取任务列表失败', error: error.message });
  }
};

/** 教师/管理员：某任务的未提交名单、超时提交名单（相对 deadline） */
const getTaskSubmissionOverview = async (req, res) => {
  try {
    const taskId = Number(req.params.id);
    const task = await getTaskRow(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    const uid = req.user.id;
    const role = req.user.role;

    if (role === 'teacher') {
      const ok = await teacherCanViewTask(uid, taskId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权查看该任务统计' });
      }
    } else if (role !== 'admin') {
      return res.status(403).json({ success: false, message: '无权查看' });
    }

    const deadline = task.deadline ? new Date(task.deadline) : null;

    let students;
    if (task.teaching_class_id) {
      [students] = await pool.query(
        `SELECT u.id, u.real_name, u.student_no, u.username
         FROM teaching_class_students tcs
         INNER JOIN users u ON u.id = tcs.student_id
         WHERE tcs.teaching_class_id = ?
         ORDER BY u.student_no, u.username`,
        [task.teaching_class_id]
      );
    } else {
      [students] = await pool.query(
        `SELECT id, real_name, student_no, username FROM users WHERE class_id = ? AND role = 'student' ORDER BY student_no, username`,
        [task.class_id]
      );
    }

    const [subs] = await pool.query(`SELECT student_id, submitted_at FROM submissions WHERE task_id = ?`, [taskId]);
    const subMap = new Map(subs.map((s) => [Number(s.student_id), s]));

    const unsubmitted = [];
    const lateSubmitters = [];

    for (const st of students) {
      const sid = Number(st.id);
      const sub = subMap.get(sid);
      if (!sub) {
        unsubmitted.push({
          id: sid,
          real_name: st.real_name,
          student_no: st.student_no,
          username: st.username,
        });
      } else if (deadline && !Number.isNaN(deadline.getTime()) && new Date(sub.submitted_at) > deadline) {
        lateSubmitters.push({
          id: sid,
          real_name: st.real_name,
          student_no: st.student_no,
          username: st.username,
          submitted_at: sub.submitted_at,
        });
      }
    }

    res.json({
      success: true,
      data: {
        taskId,
        deadline: task.deadline,
        unsubmitted,
        lateSubmitters,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取统计失败', error: error.message });
  }
};

module.exports = {
  getTasksByTeachingClass,
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getTasksByClass,
  getTaskSubmissionOverview,
};
