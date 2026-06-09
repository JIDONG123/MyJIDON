const pool = require('../config/database');
const fs = require('fs');
const path = require('path');
const {
  teacherManagesClass,
  teacherManagesTeachingClass,
  getStudentClassId,
  getStudentTeachingClassIds,
  enterpriseHasClassAccess,
  enterpriseHasTeachingClassAccess,
} = require('../utils/accessControl');
const { resolvePracticeScope, buildScopeSql } = require('../utils/practiceStatsScope');
const { formatDateTime, safeFileName } = require('../utils/exportFormatters');
const { writeWorkbookFile } = require('../utils/excelExportHelper');
const {
  resolveScopeExportLabel,
  exportAccountLabel,
  buildPracticeScoresWorkbook,
} = require('../utils/practiceScoresExport');
const { recordExportLog } = require('../services/exportLogService');
const cache = require('../utils/cacheService');

const GRADED_NO_ALIAS = `status IN ('ai_graded','human_graded')`;
const GRADED_WITH_ALIAS = `gr.status IN ('ai_graded','human_graded')`;

const getDashboardStats = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const cacheKey = cache.kDashboard('admin', 0);
      const hit = await cache.getJson(cacheKey);
      if (hit) {
        return res.json(hit);
      }

      const [userCount] = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = ?', ['student']);
      const [teacherCount] = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = ?', ['teacher']);
      const [classCount] = await pool.query('SELECT COUNT(*) as count FROM classes');
      const [taskCount] = await pool.query('SELECT COUNT(*) as count FROM tasks');
      const [submissionCount] = await pool.query('SELECT COUNT(*) as count FROM submissions');
      const [gradedCount] = await pool.query(
        `SELECT COUNT(*) as count FROM grading_results WHERE ${GRADED_NO_ALIAS}`
      );
      const [courseCount] = await pool.query('SELECT COUNT(*) AS count FROM courses');
      const [teachingClassCount] = await pool.query('SELECT COUNT(*) AS count FROM teaching_classes');
      const [curriculumTaskCount] = await pool.query(
        `SELECT COUNT(*) AS count FROM tasks WHERE course_id IS NOT NULL OR teaching_class_id IS NOT NULL`
      );

      const payload = {
        success: true,
        data: {
          studentCount: userCount[0].count,
          teacherCount: teacherCount[0].count,
          classCount: classCount[0].count,
          courseCount: courseCount[0].count,
          teachingClassCount: teachingClassCount[0].count,
          curriculumTaskCount: curriculumTaskCount[0].count,
          taskCount: taskCount[0].count,
          submissionCount: submissionCount[0].count,
          gradedCount: gradedCount[0].count,
        },
      };
      await cache.setJson(cacheKey, payload, cache.TTL.dashboard);
      return res.json(payload);
    }

    if (req.user.role === 'teacher') {
      const tid = req.user.id;
      const cacheKey = cache.kDashboard('teacher', tid);
      const hit = await cache.getJson(cacheKey);
      if (hit) {
        return res.json(hit);
      }

      const [classRows] = await pool.query(
        'SELECT COUNT(*) AS c FROM classes WHERE teacher_id = ?',
        [tid]
      );
      const [taskRows] = await pool.query('SELECT COUNT(*) AS c FROM tasks WHERE created_by = ?', [tid]);
      const [subRows] = await pool.query(
        `
        SELECT COUNT(*) AS c FROM submissions s
        JOIN tasks t ON s.task_id = t.id
        WHERE t.created_by = ?
      `,
        [tid]
      );
      const [gradedRows] = await pool.query(
        `
        SELECT COUNT(*) AS c FROM grading_results gr
        JOIN submissions s ON gr.submission_id = s.id
        JOIN tasks t ON s.task_id = t.id
        WHERE t.created_by = ? AND ${GRADED_WITH_ALIAS}
      `,
        [tid]
      );
      const [stuRows] = await pool.query(
        `
        SELECT COUNT(DISTINCT u.id) AS c FROM users u
        JOIN classes c ON u.class_id = c.id
        WHERE c.teacher_id = ? AND u.role = 'student'
      `,
        [tid]
      );

      const payload = {
        success: true,
        data: {
          classCount: classRows[0].c,
          taskCount: taskRows[0].c,
          submissionCount: subRows[0].c,
          gradedCount: gradedRows[0].c,
          studentCount: stuRows[0].c,
        },
      };
      await cache.setJson(cacheKey, payload, cache.TTL.dashboard);
      return res.json(payload);
    }

    res.status(403).json({ success: false, message: '权限不足' });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取统计数据失败', error: error.message });
  }
};

function aggregateDimensionRadar(dimRows) {
  const dimAgg = {};
  let dimCount = 0;
  for (const r of dimRows) {
    let arr = r.dimension_scores;
    if (typeof arr === 'string') {
      try {
        arr = JSON.parse(arr);
      } catch {
        arr = [];
      }
    }
    if (!Array.isArray(arr)) continue;
    dimCount += 1;
    for (const d of arr) {
      const name = d.name || '维度';
      if (!dimAgg[name]) dimAgg[name] = { sum: 0, max: 0, n: 0 };
      dimAgg[name].sum += Number(d.score) || 0;
      dimAgg[name].max += Number(d.maxScore) || 0;
      dimAgg[name].n += 1;
    }
  }
  const dimensionRadar = Object.keys(dimAgg).map((name) => ({
    name,
    value: dimAgg[name].n ? Math.round((dimAgg[name].sum / dimAgg[name].max) * 100) : 0,
  }));
  return { dimensionRadar, dimensionSampleCount: dimCount };
}

async function computePracticeStatistics(scope) {
  const scoreExpr = 'COALESCE(gr.final_score, gr.human_score, gr.total_score)';
  const { studentWhereSql, studentParams, taskWhereSql, taskParams } = buildScopeSql(scope);

  const [stats] = await pool.query(
    `
    SELECT
      AVG(${scoreExpr}) AS avgScore,
      MIN(${scoreExpr}) AS minScore,
      MAX(${scoreExpr}) AS maxScore,
      COUNT(DISTINCT s.student_id) AS studentCount,
      COUNT(s.id) AS submissionCount,
      COUNT(gr.id) AS gradedCount
    FROM submissions s
    JOIN tasks t ON s.task_id = t.id
    LEFT JOIN grading_results gr ON s.id = gr.submission_id
    WHERE ${studentWhereSql} AND ${taskWhereSql}
  `,
    [...studentParams, ...taskParams]
  );

  const [scoreDistribution] = await pool.query(
    `
    SELECT
      CASE
        WHEN ${scoreExpr} >= 90 THEN '优秀'
        WHEN ${scoreExpr} >= 80 THEN '良好'
        WHEN ${scoreExpr} >= 70 THEN '中等'
        WHEN ${scoreExpr} >= 60 THEN '及格'
        ELSE '不及格'
      END AS grade,
      COUNT(*) AS count
    FROM grading_results gr
    JOIN submissions s ON gr.submission_id = s.id
    JOIN tasks t ON s.task_id = t.id
    WHERE ${studentWhereSql} AND ${taskWhereSql} AND ${scoreExpr} IS NOT NULL
    GROUP BY grade
  `,
    [...studentParams, ...taskParams]
  );

  const [dimRows] = await pool.query(
    `
    SELECT gr.dimension_scores
    FROM grading_results gr
    JOIN submissions s ON gr.submission_id = s.id
    JOIN tasks t ON s.task_id = t.id
    WHERE ${studentWhereSql} AND ${taskWhereSql} AND gr.dimension_scores IS NOT NULL
  `,
    [...studentParams, ...taskParams]
  );

  const { dimensionRadar, dimensionSampleCount } = aggregateDimensionRadar(dimRows);

  let rosterCount = stats[0].studentCount;
  if (scope.type === 'legacy_class') {
    const [[r]] = await pool.query(
      `SELECT COUNT(*) AS c FROM users WHERE class_id = ? AND role = 'student'`,
      [scope.scopeId]
    );
    rosterCount = r.c;
  } else if (scope.type === 'teaching_class') {
    const [[r]] = await pool.query(
      `SELECT COUNT(*) AS c FROM teaching_class_students WHERE teaching_class_id = ?`,
      [scope.scopeId]
    );
    rosterCount = r.c;
  } else if (scope.type === 'course') {
    const [[r]] = await pool.query(
      `
      SELECT COUNT(DISTINCT tcs.student_id) AS c
      FROM teaching_class_students tcs
      JOIN teaching_classes tc ON tc.id = tcs.teaching_class_id
      WHERE tc.course_id = ?
    `,
      [scope.scopeId]
    );
    rosterCount = r.c;
  }

  return {
    ...stats[0],
    studentCount: rosterCount,
    scoreDistribution,
    dimensionRadar,
    dimensionSampleCount,
    scopeType: scope.type,
    scopeId: scope.scopeId,
  };
}

const getPracticeStatistics = async (req, res) => {
  try {
    const scope = await resolvePracticeScope(req);
    if (!scope.ok) {
      return res.status(scope.status).json({ success: false, message: scope.message });
    }
    const data = await computePracticeStatistics(scope);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取实训统计失败', error: error.message });
  }
};

const getClassStatistics = async (req, res) => {
  try {
    const { classId } = req.params;

    if (req.user.role === 'teacher') {
      const ok = await teacherManagesClass(req.user.id, classId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权查看该班级统计' });
      }
    }

    const data = await computePracticeStatistics({
      ok: true,
      type: 'legacy_class',
      scopeId: Number(classId),
      termId: null,
      taskId: null,
      teacherId: req.user.role === 'teacher' ? req.user.id : null,
    });

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取班级统计失败', error: error.message });
  }
};

const exportPracticeScores = async (req, res) => {
  try {
    const scope = await resolvePracticeScope(req);
    if (!scope.ok) {
      return res.status(scope.status).json({ success: false, message: scope.message });
    }

    const { studentWhereSql, studentParams, taskWhereSql, taskParams } = buildScopeSql(scope);
    const scoreExpr = 'COALESCE(gr.final_score, gr.human_score, gr.total_score)';

    const [scores] = await pool.query(
      `
      SELECT
        u.real_name AS studentName,
        u.student_no AS studentNo,
        lc.class_name AS adminClassName,
        t.title AS taskName,
        co.course_name AS courseName,
        tc.class_name AS teachingClassName,
        tm.name AS termName,
        tpl.project_name AS projectName,
        gr.total_score AS aiScore,
        gr.human_score AS humanScore,
        gr.enterprise_score AS enterpriseScore,
        ${scoreExpr} AS finalScore,
        gr.status,
        s.submitted_at AS submittedAt
      FROM submissions s
      JOIN users u ON u.id = s.student_id
      JOIN tasks t ON s.task_id = t.id
      LEFT JOIN classes lc ON u.class_id = lc.id
      LEFT JOIN courses co ON t.course_id = co.id
      LEFT JOIN teaching_classes tc ON t.teaching_class_id = tc.id
      LEFT JOIN terms tm ON tc.term_id = tm.id
      LEFT JOIN training_project_templates tpl ON t.project_template_id = tpl.id
      LEFT JOIN grading_results gr ON s.id = gr.submission_id
      WHERE ${studentWhereSql} AND ${taskWhereSql}
      ORDER BY co.course_name, tc.class_name, t.title, u.real_name
    `,
      [...studentParams, ...taskParams]
    );

    const exportTime = formatDateTime(new Date());
    const scopeLabel = await resolveScopeExportLabel(scope);
    const exportAccount = exportAccountLabel(req.user);
    const meta = { scopeLabel, exportTime, exportAccount };

    const { workbook } = buildPracticeScoresWorkbook(scores, meta);
    const fileName = `实训成绩_${scope.type}_${scope.scopeId}_${Date.now()}.xlsx`;

    const exportDir = path.join(__dirname, '..', 'exports');
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
    const filePath = path.join(exportDir, fileName);
    await writeWorkbookFile(workbook, filePath);

    recordExportLog({
      userId: req.user.id,
      exportType: 'practice_scores_excel',
      format: 'xlsx',
      scopeLabel,
      taskId: scope.taskId || null,
      scopeType: scope.type,
      scopeId: scope.scopeId,
      fileName,
      rowCount: scores.length,
    });

    res.download(filePath, safeFileName(fileName), (err) => {
      if (err) {
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: '导出失败', error: err.message });
        }
      }
      try {
        fs.unlinkSync(filePath);
      } catch (_) {
        /* ignore */
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '导出失败', error: error.message });
  }
};

const exportClassScores = async (req, res) => {
  try {
    req.query = { ...req.query, scopeType: 'legacy_class', scopeId: req.params.classId, classId: req.params.classId };
    return exportPracticeScores(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: '导出失败', error: error.message });
  }
};

const getAllClassStatistics = async (req, res) => {
  try {
    const params = [];
    let query;
    if (req.user.role === 'teacher') {
      query = `
      SELECT 
        c.id,
        c.class_name,
        COUNT(DISTINCT u.id) as studentCount,
        COUNT(DISTINCT s.id) as submissionCount,
        COUNT(DISTINCT gr.id) as gradedCount,
        AVG(gr.total_score) as avgScore
      FROM classes c
      LEFT JOIN users u ON c.id = u.class_id AND u.role = 'student'
      LEFT JOIN submissions s ON u.id = s.student_id
        AND s.task_id IN (SELECT id FROM tasks WHERE created_by = ? AND class_id = c.id)
      LEFT JOIN grading_results gr ON s.id = gr.submission_id
      WHERE c.teacher_id = ?
      GROUP BY c.id, c.class_name ORDER BY c.class_name
    `;
      params.push(req.user.id, req.user.id);
    } else {
      query = `
      SELECT 
        c.id,
        c.class_name,
        COUNT(DISTINCT u.id) as studentCount,
        COUNT(DISTINCT s.id) as submissionCount,
        COUNT(DISTINCT gr.id) as gradedCount,
        AVG(gr.total_score) as avgScore
      FROM classes c
      LEFT JOIN users u ON c.id = u.class_id AND u.role = 'student'
      LEFT JOIN submissions s ON u.id = s.student_id
      LEFT JOIN grading_results gr ON s.id = gr.submission_id
      GROUP BY c.id, c.class_name ORDER BY c.class_name
    `;
    }

    const [stats] = await pool.query(query, params);

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取统计数据失败', error: error.message });
  }
};

const getBigScreenStats = async (req, res) => {
  try {
    const qClass =
      req.query.classId != null && req.query.classId !== '' ? Number(req.query.classId) : null;
    const qTeachingClass =
      req.query.teachingClassId != null && req.query.teachingClassId !== ''
        ? Number(req.query.teachingClassId)
        : null;
    const role = req.user.role;
    const uid = req.user.id;
    let classId = qClass;
    let teachingClassId = qTeachingClass;

    if (role === 'student') {
      if (teachingClassId) {
        const tcIds = await getStudentTeachingClassIds(uid);
        if (!tcIds.includes(teachingClassId)) {
          return res.status(403).json({ success: false, message: '无权查看该教学班' });
        }
        classId = null;
      } else if (classId == null) {
        classId = await getStudentClassId(uid);
        if (classId == null) {
          const tcIds = await getStudentTeachingClassIds(uid);
          if (!tcIds.length) {
            return res.json({ success: true, data: { empty: true, message: '未加入班级或教学班' } });
          }
          teachingClassId = tcIds[0];
        }
      }
    } else if (role === 'teacher') {
      if (teachingClassId) {
        const ok = await teacherManagesTeachingClass(uid, teachingClassId);
        if (!ok) return res.status(403).json({ success: false, message: '无权查看' });
        classId = null;
      } else if (classId) {
        const ok = await teacherManagesClass(uid, classId);
        if (!ok) return res.status(403).json({ success: false, message: '无权查看' });
      } else {
        return res.status(400).json({ success: false, message: '请传入 classId 或 teachingClassId' });
      }
    } else if (role === 'enterprise') {
      if (teachingClassId) {
        const ok = await enterpriseHasTeachingClassAccess(uid, teachingClassId);
        if (!ok) return res.status(403).json({ success: false, message: '无权查看' });
        classId = null;
      } else if (classId) {
        const ok = await enterpriseHasClassAccess(uid, classId);
        if (!ok) return res.status(403).json({ success: false, message: '无权查看' });
      } else {
        return res.status(400).json({ success: false, message: '请传入 classId 或 teachingClassId' });
      }
    } else if (role === 'admin') {
      /* keep query params */
    }

    const scoreExpr = 'COALESCE(gr.final_score, gr.human_score, gr.total_score)';
    let userScope = "u.role = 'student'";
    const scopeParams = [];
    let taskScopeSql = '1=1';
    const taskScopeParams = [];

    if (teachingClassId != null) {
      userScope +=
        ' AND u.id IN (SELECT student_id FROM teaching_class_students WHERE teaching_class_id = ?)';
      scopeParams.push(teachingClassId);
      taskScopeSql = 't.teaching_class_id = ?';
      taskScopeParams.push(teachingClassId);
    } else if (classId != null) {
      userScope += ' AND u.class_id = ?';
      scopeParams.push(classId);
      taskScopeSql = 't.class_id = ?';
      taskScopeParams.push(classId);
    }

    if (role === 'teacher') {
      taskScopeSql += ' AND t.created_by = ?';
      taskScopeParams.push(uid);
    }

    const [[stuC]] = await pool.query(`SELECT COUNT(*) AS c FROM users u WHERE ${userScope}`, scopeParams);

    const [[taskC]] = await pool.query(
      `SELECT COUNT(*) AS c FROM tasks t WHERE ${taskScopeSql}`,
      taskScopeParams
    );

    const subParams = [...scopeParams, ...taskScopeParams];
    const [[subC]] = await pool.query(
      `
      SELECT COUNT(*) AS c FROM submissions s
      JOIN users u ON u.id = s.student_id
      JOIN tasks t ON t.id = s.task_id
      WHERE ${userScope} AND ${taskScopeSql}
    `,
      subParams
    );

    const gradeParams = [...scopeParams, ...taskScopeParams];
    const [[avgRow]] = await pool.query(
      `
      SELECT AVG(${scoreExpr}) AS avgScore,
             SUM(CASE WHEN ${scoreExpr} IS NOT NULL THEN 1 ELSE 0 END) AS gradedRows
      FROM grading_results gr
      JOIN submissions s ON s.id = gr.submission_id
      JOIN users u ON u.id = s.student_id
      JOIN tasks t ON t.id = s.task_id
      WHERE ${userScope} AND ${taskScopeSql}
    `,
      gradeParams
    );

    const [buckets] = await pool.query(
      `
      SELECT
        CASE
          WHEN ${scoreExpr} >= 90 THEN '90+'
          WHEN ${scoreExpr} >= 80 THEN '80-89'
          WHEN ${scoreExpr} >= 70 THEN '70-79'
          WHEN ${scoreExpr} >= 60 THEN '60-69'
          ELSE '<60'
        END AS bucket,
        COUNT(*) AS cnt
      FROM grading_results gr
      JOIN submissions s ON s.id = gr.submission_id
      JOIN users u ON u.id = s.student_id
      JOIN tasks t ON t.id = s.task_id
      WHERE ${userScope} AND ${taskScopeSql} AND ${scoreExpr} IS NOT NULL
      GROUP BY bucket
    `,
      gradeParams
    );

    const [weak] = await pool.query(
      `
      SELECT gr.ai_problems AS hint
      FROM grading_results gr
      JOIN submissions s ON s.id = gr.submission_id
      JOIN users u ON u.id = s.student_id
      JOIN tasks t ON t.id = s.task_id
      WHERE ${userScope} AND ${taskScopeSql} AND gr.ai_problems IS NOT NULL AND gr.ai_problems != ''
      ORDER BY s.submitted_at DESC
      LIMIT 10
    `,
      gradeParams
    );

    const overview = {
      studentCount: stuC.c,
      taskCount: taskC.c,
      submissionCount: subC.c,
      avgScore: avgRow.avgScore,
      gradedCount: avgRow.gradedRows,
    };

    res.json({
      success: true,
      data: {
        classId: classId != null ? classId : null,
        teachingClassId: teachingClassId != null ? teachingClassId : null,
        scopeType: teachingClassId != null ? 'teaching_class' : classId != null ? 'legacy_class' : null,
        overview,
        scoreBuckets: buckets,
        weakHints: weak.map((w) => String(w.hint).slice(0, 120)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '大屏数据失败', error: error.message });
  }
};

module.exports = {
  getDashboardStats,
  getClassStatistics,
  getPracticeStatistics,
  exportClassScores,
  exportPracticeScores,
  getAllClassStatistics,
  getBigScreenStats,
};
