const pool = require('../config/database');
const { teacherManagesClass, getStudentClassId } = require('../utils/accessControl');

async function buildWeakPayloadForClass(classId) {
  const [rows] = await pool.query(
    `
      SELECT gr.ai_problems, gr.dimension_scores, gr.verification_result
      FROM grading_results gr
      JOIN submissions s ON s.id = gr.submission_id
      JOIN users u ON u.id = s.student_id
      WHERE u.class_id = ? AND u.role = 'student'
      LIMIT 500
    `,
    [classId]
  );

  const dimAgg = {};
  const problemSnippets = [];
  for (const r of rows) {
    if (r.ai_problems && String(r.ai_problems).trim()) {
      problemSnippets.push(String(r.ai_problems).trim().slice(0, 200));
    }
    const arr = parseJson(r.dimension_scores);
    if (Array.isArray(arr)) {
      for (const d of arr) {
        const name = d.name || '维度';
        const maxS = Number(d.maxScore) || 1;
        const sc = Number(d.score) || 0;
        const ratio = sc / maxS;
        if (!dimAgg[name]) dimAgg[name] = { n: 0, low: 0 };
        dimAgg[name].n += 1;
        if (ratio < 0.65) dimAgg[name].low += 1;
      }
    }
  }

  const weakDimensions = Object.keys(dimAgg)
    .map((name) => ({
      name,
      lowRate: dimAgg[name].n ? Math.round((dimAgg[name].low / dimAgg[name].n) * 100) : 0,
      sample: dimAgg[name].n,
    }))
    .filter((x) => x.lowRate >= 25)
    .sort((a, b) => b.lowRate - a.lowRate)
    .slice(0, 8);

  return {
    weakDimensions,
    problemSamples: problemSnippets.slice(0, 12),
  };
}

function parseJson(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

/** 班级薄弱点：从 AI 问题分析与维度得分聚合简单标签 */
const getClassWeak = async (req, res) => {
  try {
    const classId = Number(req.params.classId);
    if (req.user.role === 'teacher') {
      const ok = await teacherManagesClass(req.user.id, classId);
      if (!ok) return res.status(403).json({ success: false, message: '无权查看' });
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '无权查看' });
    }

    const data = await buildWeakPayloadForClass(classId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: '分析失败', error: error.message });
  }
};

/** 学生个人学情画像（基于已有批改记录） */
const getMyLearningProfile = async (req, res) => {
  try {
    const sid = req.user.id;
    const [rows] = await pool.query(
      `
      SELECT gr.ai_problems, gr.ai_suggestions, gr.dimension_scores, gr.verification_result,
             COALESCE(gr.final_score, gr.total_score) AS score, t.title
      FROM grading_results gr
      JOIN submissions s ON s.id = gr.submission_id
      JOIN tasks t ON t.id = s.task_id
      WHERE s.student_id = ?
      ORDER BY s.submitted_at DESC
      LIMIT 30
    `,
      [sid]
    );

    const weakPoints = [];
    const suggestions = [];
    for (const r of rows) {
      if (r.ai_problems) weakPoints.push({ source: r.title, text: String(r.ai_problems).slice(0, 300) });
      if (r.ai_suggestions) suggestions.push({ source: r.title, text: String(r.ai_suggestions).slice(0, 300) });
    }

    res.json({
      success: true,
      data: {
        recentCount: rows.length,
        avgScore:
          rows.length > 0
            ? parseFloat(
                (
                  rows.reduce((a, b) => a + (Number(b.score) || 0), 0) / rows.length
                ).toFixed(2)
              )
            : null,
        weakPoints: weakPoints.slice(0, 8),
        improvementSuggestions: suggestions.slice(0, 8),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取学情失败', error: error.message });
  }
};

/** 学生个人：近期批改中维度得分偏低占比高 → 视为「显著薄弱」，压低进阶推荐 */
async function studentDimensionWeakHeavy(studentId) {
  const [rows] = await pool.query(
    `
    SELECT gr.dimension_scores
    FROM grading_results gr
    JOIN submissions s ON s.id = gr.submission_id
    WHERE s.student_id = ?
    ORDER BY s.submitted_at DESC
    LIMIT 14
  `,
    [studentId]
  );
  let total = 0;
  let low = 0;
  for (const r of rows) {
    const arr = parseJson(r.dimension_scores);
    if (!Array.isArray(arr)) continue;
    for (const d of arr) {
      const maxS = Number(d.maxScore) || 100;
      const sc = Number(d.score) || 0;
      if (maxS <= 0) continue;
      total += 1;
      if (sc / maxS < 0.55) low += 1;
    }
  }
  return total >= 5 && low / total >= 0.35;
}

async function getClassRecThresholds(classId) {
  const defaults = { basicBelow: 62, advancedAbove: 86 };
  try {
    const [[row]] = await pool.query(
      'SELECT rec_basic_below AS b, rec_advanced_above AS a FROM classes WHERE id = ?',
      [classId]
    );
    if (!row) return defaults;
    const b = Number(row.b);
    const a = Number(row.a);
    return {
      basicBelow: Number.isFinite(b) ? b : defaults.basicBelow,
      advancedAbove: Number.isFinite(a) ? a : defaults.advancedAbove,
    };
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') return defaults;
    throw e;
  }
}

/** 教师/管理员：查看本班分层推荐分数线（仅阈值，不改变已发布任务） */
const getClassRecommendationRules = async (req, res) => {
  try {
    const classId = Number(req.params.classId);
    if (!Number.isFinite(classId)) {
      return res.status(400).json({ success: false, message: '无效的班级 ID' });
    }
    if (req.user.role === 'teacher') {
      const ok = await teacherManagesClass(req.user.id, classId);
      if (!ok) return res.status(403).json({ success: false, message: '无权查看' });
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '无权查看' });
    }
    const [[exists]] = await pool.query('SELECT id FROM classes WHERE id = ?', [classId]);
    if (!exists) return res.status(404).json({ success: false, message: '班级不存在' });
    const t = await getClassRecThresholds(classId);
    res.json({
      success: true,
      data: {
        basicBelow: t.basicBelow,
        advancedAbove: t.advancedAbove,
        hint:
          '仅影响学生首页「推荐任务」排序与难度分层，不修改、不替换教师已发布的任务列表；学生仍可看到并完成所有已发布任务。',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '读取规则失败', error: error.message });
  }
};

/** 教师/管理员：调整本班分层推荐分数线 */
const putClassRecommendationRules = async (req, res) => {
  try {
    const classId = Number(req.params.classId);
    if (!Number.isFinite(classId)) {
      return res.status(400).json({ success: false, message: '无效的班级 ID' });
    }
    if (req.user.role === 'teacher') {
      const ok = await teacherManagesClass(req.user.id, classId);
      if (!ok) return res.status(403).json({ success: false, message: '无权修改' });
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '无权修改' });
    }
    let basicBelow = Number(req.body?.basicBelow);
    let advancedAbove = Number(req.body?.advancedAbove);
    if (!Number.isFinite(basicBelow) || !Number.isFinite(advancedAbove)) {
      return res.status(400).json({ success: false, message: '请提供有效的 basicBelow、advancedAbove 数字' });
    }
    if (basicBelow <= 0 || basicBelow >= 100 || advancedAbove <= 0 || advancedAbove > 100) {
      return res.status(400).json({ success: false, message: '分数线需在 0–100 之间' });
    }
    if (basicBelow + 5 > advancedAbove) {
      return res.status(400).json({ success: false, message: '巩固线须低于挑战线至少 5 分' });
    }
    const [upd] = await pool.query('UPDATE classes SET rec_basic_below = ?, rec_advanced_above = ? WHERE id = ?', [
      basicBelow,
      advancedAbove,
      classId,
    ]);
    if (!upd.affectedRows) {
      return res.status(404).json({ success: false, message: '班级不存在' });
    }
    res.json({ success: true, data: { basicBelow, advancedAbove } });
  } catch (error) {
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({
        success: false,
        message: '数据库尚未执行推荐规则迁移，请运行 backend/sql/migration_class_recommendation_rules.sql',
      });
    }
    res.status(500).json({ success: false, message: '保存失败', error: error.message });
  }
};

/**
 * 按历史均分 + 维度薄弱 + 任务难度标签推荐「尚未提交」的任务（仅本班已发布任务中筛选，不覆盖教师发布）
 */
const getMyRecommendations = async (req, res) => {
  try {
    const sid = req.user.id;
    const cid = await getStudentClassId(sid);
    if (cid == null) {
      return res.json({ success: true, data: { tier: 'standard', tasks: [], weakHeavy: false } });
    }

    const { basicBelow, advancedAbove } = await getClassRecThresholds(cid);

    const [[avgRow]] = await pool.query(
      `
      SELECT AVG(COALESCE(gr.final_score, gr.human_score, gr.total_score)) AS a
      FROM grading_results gr
      JOIN submissions s ON s.id = gr.submission_id
      WHERE s.student_id = ?
    `,
      [sid]
    );
    const avg = Number(avgRow?.a);
    const weakHeavy = await studentDimensionWeakHeavy(sid);

    let tier = 'standard';
    if (!Number.isFinite(avg)) {
      tier = weakHeavy ? 'basic' : 'standard';
    } else if (avg < basicBelow || (weakHeavy && avg < advancedAbove)) {
      tier = 'basic';
    } else if (avg >= advancedAbove && !weakHeavy) {
      tier = 'advanced';
    } else {
      tier = 'standard';
    }

    const diff = tier === 'basic' ? 'basic' : tier === 'advanced' ? 'advanced' : 'standard';

    const [tasks] = await pool.query(
      `
      SELECT t.id, t.title, t.deadline, t.max_score, t.difficulty_level
      FROM tasks t
      LEFT JOIN submissions s ON s.task_id = t.id AND s.student_id = ?
      WHERE t.class_id = ? AND s.id IS NULL AND t.difficulty_level = ?
      ORDER BY t.deadline ASC
      LIMIT 8
    `,
      [sid, cid, diff]
    );

    res.json({ success: true, data: { tier, tasks, weakHeavy } });
  } catch (error) {
    res.status(500).json({ success: false, message: '推荐失败', error: error.message });
  }
};

/** 教师查看学生助手高频提问（简单聚合） */
const getAssistantTeacherStats = async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '无权查看' });
    }

    if (req.user.role === 'admin') {
      const [msgs] = await pool.query(
        `
        SELECT m.content, COUNT(*) AS c
        FROM assistant_messages m
        WHERE m.role = 'user'
        GROUP BY m.content
        ORDER BY c DESC
        LIMIT 30
      `
      );
      return res.json({
        success: true,
        data: {
          topQuestions: msgs.map((m) => ({ text: String(m.content).slice(0, 200), count: m.c })),
        },
      });
    }

    const teacherId = req.user.id;
    const [students] = await pool.query(
      `SELECT u.id FROM users u
       JOIN classes c ON c.id = u.class_id
       WHERE u.role = 'student' AND c.teacher_id = ?`,
      [teacherId]
    );
    const ids = students.map((s) => s.id);
    if (!ids.length) {
      return res.json({ success: true, data: { topQuestions: [] } });
    }
    const ph = ids.map(() => '?').join(',');
    const [msgs] = await pool.query(
      `
      SELECT m.content, COUNT(*) AS c
      FROM assistant_messages m
      JOIN assistant_sessions sess ON sess.id = m.session_id
      WHERE m.role = 'user' AND sess.student_id IN (${ph})
      GROUP BY m.content
      ORDER BY c DESC
      LIMIT 20
    `,
      ids
    );

    res.json({
      success: true,
      data: {
        topQuestions: msgs.map((m) => ({ text: String(m.content).slice(0, 200), count: m.c })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '统计失败', error: error.message });
  }
};

/** 学生：仅本班学情薄弱统计 */
const getMyClassWeak = async (req, res) => {
  try {
    const cid = await getStudentClassId(req.user.id);
    if (cid == null) {
      return res.json({ success: true, data: { weakDimensions: [], problemSamples: [] } });
    }
    const data = await buildWeakPayloadForClass(cid);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: '分析失败', error: error.message });
  }
};

module.exports = {
  getClassWeak,
  getMyClassWeak,
  getMyLearningProfile,
  getMyRecommendations,
  getClassRecommendationRules,
  putClassRecommendationRules,
  getAssistantTeacherStats,
};
