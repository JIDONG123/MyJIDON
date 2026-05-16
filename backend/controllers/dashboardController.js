const pool = require('../config/database');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { teacherManagesClass, getStudentClassId, enterpriseHasClassAccess } = require('../utils/accessControl');
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

      const payload = {
        success: true,
        data: {
          studentCount: userCount[0].count,
          teacherCount: teacherCount[0].count,
          classCount: classCount[0].count,
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

const getClassStatistics = async (req, res) => {
  try {
    const { classId } = req.params;

    if (req.user.role === 'teacher') {
      const ok = await teacherManagesClass(req.user.id, classId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权查看该班级统计' });
      }
    }

    const scoreExpr = 'COALESCE(gr.final_score, gr.human_score, gr.total_score)';

    const [stats] = await pool.query(
      `
      SELECT 
        AVG(${scoreExpr}) as avgScore,
        MIN(${scoreExpr}) as minScore,
        MAX(${scoreExpr}) as maxScore,
        COUNT(DISTINCT s.student_id) as studentCount,
        COUNT(s.id) as submissionCount,
        COUNT(gr.id) as gradedCount
      FROM classes c
      LEFT JOIN users u ON c.id = u.class_id AND u.role = 'student'
      LEFT JOIN submissions s ON u.id = s.student_id
      LEFT JOIN grading_results gr ON s.id = gr.submission_id
      WHERE c.id = ?
    `,
      [classId]
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
        END as grade,
        COUNT(*) as count
      FROM grading_results gr
      LEFT JOIN submissions s ON gr.submission_id = s.id
      WHERE s.student_id IN (SELECT id FROM users WHERE class_id = ?)
        AND ${scoreExpr} IS NOT NULL
      GROUP BY grade
    `,
      [classId]
    );

    const [dimRows] = await pool.query(
      `
      SELECT gr.dimension_scores
      FROM grading_results gr
      JOIN submissions s ON gr.submission_id = s.id
      WHERE s.student_id IN (SELECT id FROM users WHERE class_id = ?)
        AND gr.dimension_scores IS NOT NULL
    `,
      [classId]
    );

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

    res.json({
      success: true,
      data: {
        ...stats[0],
        scoreDistribution: scoreDistribution,
        dimensionRadar,
        dimensionSampleCount: dimCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取班级统计失败', error: error.message });
  }
};

const exportClassScores = async (req, res) => {
  try {
    const { classId } = req.params;

    if (req.user.role === 'teacher') {
      const ok = await teacherManagesClass(req.user.id, classId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权导出该班级成绩' });
      }
    }

    const [scores] = await pool.query(
      `
      SELECT 
        u.real_name as studentName,
        t.title as taskName,
        gr.total_score as aiScore,
        gr.human_score as humanScore,
        gr.final_score as finalScore,
        gr.status,
        s.submitted_at
      FROM users u
      LEFT JOIN submissions s ON u.id = s.student_id
      LEFT JOIN tasks t ON s.task_id = t.id
      LEFT JOIN grading_results gr ON s.id = gr.submission_id
      WHERE u.class_id = ?
      ORDER BY t.title, u.real_name
    `,
      [classId]
    );

    const worksheet = xlsx.utils.json_to_sheet(scores);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, '成绩明细');

    const nums = scores
      .map((r) => {
        const v = r.finalScore ?? r.humanScore ?? r.aiScore;
        const n = v != null && v !== '' ? Number(v) : NaN;
        return Number.isFinite(n) ? n : null;
      })
      .filter((n) => n != null);
    const summaryRows = [
      { 统计项: '记录行数', 值: scores.length },
      { 统计项: '含有效分数行数', 值: nums.length },
      {
        统计项: '平均分(按综合/教师/AI可用列)',
        值: nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '-',
      },
      { 统计项: '最高分', 值: nums.length ? Math.max(...nums).toFixed(2) : '-' },
      { 统计项: '最低分', 值: nums.length ? Math.min(...nums).toFixed(2) : '-' },
    ];
    const summarySheet = xlsx.utils.json_to_sheet(summaryRows);
    xlsx.utils.book_append_sheet(workbook, summarySheet, '统计摘要');

    const exportDir = path.join(__dirname, '..', 'exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const fileName = `班级成绩表_${Date.now()}.xlsx`;
    const filePath = path.join(exportDir, fileName);
    xlsx.writeFile(workbook, filePath);

    res.download(filePath, fileName, (err) => {
      if (err) {
        res.status(500).json({ success: false, message: '导出失败', error: err.message });
      }
      fs.unlinkSync(filePath);
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '导出失败', error: error.message });
  }
};

const getAllClassStatistics = async (req, res) => {
  try {
    let query = `
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
    `;
    const params = [];
    if (req.user.role === 'teacher') {
      query += ' WHERE c.teacher_id = ?';
      params.push(req.user.id);
    }
    query += ' GROUP BY c.id, c.class_name ORDER BY c.class_name';

    const [stats] = await pool.query(query, params);

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取统计数据失败', error: error.message });
  }
};

const getBigScreenStats = async (req, res) => {
  try {
    const qClass = req.query.classId != null && req.query.classId !== '' ? Number(req.query.classId) : null;
    const role = req.user.role;
    const uid = req.user.id;
    let classId = qClass;

    if (role === 'student') {
      classId = await getStudentClassId(uid);
      if (classId == null) {
        return res.json({ success: true, data: { empty: true, message: '未分班' } });
      }
    } else if (role === 'teacher') {
      if (!qClass) {
        return res.status(400).json({ success: false, message: '请传入 classId' });
      }
      const ok = await teacherManagesClass(uid, qClass);
      if (!ok) return res.status(403).json({ success: false, message: '无权查看' });
    } else if (role === 'enterprise') {
      if (!qClass) {
        return res.status(400).json({ success: false, message: '请传入 classId' });
      }
      const ok = await enterpriseHasClassAccess(uid, qClass);
      if (!ok) return res.status(403).json({ success: false, message: '无权查看' });
    } else if (role === 'admin') {
      classId = qClass;
    }

    const scoreExpr = 'COALESCE(gr.final_score, gr.human_score, gr.total_score)';
    let userScope = "u.role = 'student'";
    const scopeParams = [];
    if (classId != null) {
      userScope += ' AND u.class_id = ?';
      scopeParams.push(classId);
    }

    const [[stuC]] = await pool.query(`SELECT COUNT(*) AS c FROM users u WHERE ${userScope}`, scopeParams);

    let taskSql = 'SELECT COUNT(*) AS c FROM tasks';
    const taskParams = [];
    if (classId != null) {
      taskSql += ' WHERE class_id = ?';
      taskParams.push(classId);
    }

    const [[taskC]] = await pool.query(taskSql, taskParams);

    const subSql = `SELECT COUNT(*) AS c FROM submissions s JOIN users u ON u.id = s.student_id WHERE ${userScope}`;
    const [[subC]] = await pool.query(subSql, scopeParams);

    const [[avgRow]] = await pool.query(
      `
      SELECT AVG(${scoreExpr}) AS avgScore,
             SUM(CASE WHEN ${scoreExpr} IS NOT NULL THEN 1 ELSE 0 END) AS gradedRows
      FROM grading_results gr
      JOIN submissions s ON s.id = gr.submission_id
      JOIN users u ON u.id = s.student_id
      WHERE ${userScope}
    `,
      scopeParams
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
      WHERE ${userScope} AND ${scoreExpr} IS NOT NULL
      GROUP BY bucket
    `,
      scopeParams
    );

    const [weak] = await pool.query(
      `
      SELECT gr.ai_problems AS hint
      FROM grading_results gr
      JOIN submissions s ON s.id = gr.submission_id
      JOIN users u ON u.id = s.student_id
      WHERE ${userScope} AND gr.ai_problems IS NOT NULL AND gr.ai_problems != ''
      ORDER BY s.submitted_at DESC
      LIMIT 10
    `,
      scopeParams
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
  exportClassScores,
  getAllClassStatistics,
  getBigScreenStats,
};
