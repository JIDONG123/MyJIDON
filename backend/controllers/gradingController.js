const pool = require('../config/database');
const { getSystemConfigs } = require('../utils/llmClient');
const {
  teacherOwnsSubmissionTask,
  teacherOwnsTaskForGrading,
  enterpriseOwnsSubmissionTask,
} = require('../utils/accessControl');
const { safeNotify, notifyUser } = require('../utils/notify');
const { buildFinalFromGradingRow } = require('../utils/gradingFinal');
const { mapSubmissionFileName } = require('../utils/filenameEncoding');
const gradingJobService = require('../services/gradingJobService');
const { detectTextSafety } = require('../services/contentSafetyService');
const cache = require('../utils/cacheService');
const rt = require('../utils/realtimeEmit');

function toNumberOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseJsonField(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

function normalizeMaxSubmissions(raw) {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 9999);
}

async function loadGradingWeightsRow(submissionId) {
  const [rows] = await pool.query(
    `
    SELECT gr.total_score, gr.human_score, gr.enterprise_score,
           t.score_ai_weight, t.score_human_weight, t.campus_grade_weight, t.enterprise_grade_weight
    FROM grading_results gr
    JOIN submissions s ON gr.submission_id = s.id
    JOIN tasks t ON s.task_id = t.id
    WHERE gr.submission_id = ?
  `,
    [submissionId]
  );
  return rows[0] || null;
}

async function persistFinalScoreForSubmission(submissionId) {
  const row = await loadGradingWeightsRow(submissionId);
  if (!row) return null;
  const systemW = await getSystemConfigs(['score_ai_weight', 'score_human_weight']);
  const finalScore = buildFinalFromGradingRow(row, systemW);
  await pool.query('UPDATE grading_results SET final_score = ? WHERE submission_id = ?', [finalScore, submissionId]);
  return finalScore;
}

const aiGradeSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const forceRegrade = Boolean(req.body?.forceRegrade ?? req.body?.force_regrade);
    const regradeReason = req.body?.regradeReason ?? req.body?.regrade_reason ?? null;
    const result = await gradingJobService.createSingleJob({
      submissionId,
      userId: req.user.id,
      role: req.user.role,
      forceRegrade,
      regradeReason,
    });

    return res.json({
      success: true,
      message: '已提交 AI 批改，后台处理中',
      data: {
        async: true,
        submissionId: result.submissionId,
        status: result.status,
        jobId: result.jobId,
        deduped: false,
        jobStatus: result.jobStatus,
        progress: result.progress,
        totalCount: result.totalCount,
        finishedCount: result.finishedCount,
        taskId: result.taskId,
        taskTitle: result.taskTitle,
        scopeType: result.scopeType,
        forceRegrade,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message || 'AI批改失败', error: error.message });
  }
};

const batchAiGrade = async (req, res) => {
  try {
    const { taskId } = req.params;
    const batchMode = req.body?.batchMode ?? req.body?.batch_mode ?? req.query?.batchMode ?? req.query?.batch_mode;
    const submissionIds = req.body?.submissionIds ?? req.body?.submission_ids;
    const result = await gradingJobService.createBatchJob({
      taskId,
      userId: req.user.id,
      role: req.user.role,
      batchMode,
      submissionIds,
    });

    const baseData = {
      async: true,
      taskId: Number(taskId),
      queued: result.queued ?? 0,
      batchId: result.batchId ?? null,
      jobId: result.jobId ?? null,
      gradingJobId: result.jobId ?? null,
      deduped: Boolean(result.deduped),
      batchMode: result.batchMode || 'new_only',
      requestedCount: result.requestedCount ?? null,
      acceptedCount: result.acceptedCount ?? result.queued ?? 0,
      skippedCount: result.skippedCount ?? 0,
      skippedItems: result.skippedItems ?? [],
    };

    if (!result.queued) {
      return res.json({
        success: true,
        message: result.message || (result.deduped ? '没有待批量批改的提交' : '没有待批量批改的提交'),
        data: baseData,
      });
    }

    return res.json({
      success: true,
      message: `已加入批量 AI 批改队列，共 ${result.queued} 份`,
      data: baseData,
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message || '批量批改失败', error: error.message });
  }
};

const getEligibleSubmissions = async (req, res) => {
  try {
    const { taskId } = req.params;
    const filterKey = req.query.filter || req.query.statusTab || req.query.filterKey || 'all';
    let lateStudentIds = [];
    if (req.query.lateStudentIds) {
      try {
        lateStudentIds = JSON.parse(req.query.lateStudentIds);
      } catch {
        lateStudentIds = String(req.query.lateStudentIds)
          .split(',')
          .map((x) => Number(x.trim()))
          .filter(Boolean);
      }
    }

    const { listEligibleSubmissionsForTask } = require('../utils/submissionAiBatchEligibility');
    const data = await listEligibleSubmissionsForTask({
      taskId,
      userId: req.user.id,
      role: req.user.role,
      filterKey,
      lateStudentIds,
    });

    return res.json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message || '获取可批改提交失败', error: error.message });
  }
};

const getBatchGradingProgress = async (req, res) => {
  try {
    const batchId = req.params.batchId;

    const jobRow = await gradingJobService.getProgressByLegacyBatchId(batchId);
    if (jobRow) {
      if (req.user.role === 'teacher') {
        const task = await teacherOwnsTaskForGrading(req.user.id, jobRow.task_id);
        if (!task) {
          return res.status(403).json({ success: false, message: '无权查看该批次进度' });
        }
      }
      const total = Number(jobRow.total_count) || 0;
      const done = Number(jobRow.success_count) || 0;
      const failed = Number(jobRow.failed_count) || 0;
      const finished = Number(jobRow.finished_count) || 0;
      const grading = Math.max(0, total - finished);
      return res.json({
        success: true,
        data: {
          taskId: Number(jobRow.task_id),
          batchId: String(batchId),
          jobId: Number(jobRow.id),
          total,
          grading: ['pending', 'running'].includes(jobRow.status) ? grading : 0,
          failed,
          done,
          progress: jobRow.progress,
          status: jobRow.status,
        },
      });
    }

    const [rows] = await pool.query(
      `SELECT DISTINCT s.task_id FROM grading_results gr JOIN submissions s ON s.id = gr.submission_id WHERE gr.ai_batch_id = ?`,
      [batchId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '批次不存在或已过期' });
    }
    const taskId = rows[0].task_id;
    if (req.user.role === 'teacher') {
      const task = await teacherOwnsTaskForGrading(req.user.id, taskId);
      if (!task) {
        return res.status(403).json({ success: false, message: '无权查看该批次进度' });
      }
    }

    const [counts] = await pool.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN gr.status = 'ai_grading' THEN 1 ELSE 0 END) AS grading,
        SUM(CASE WHEN gr.status = 'ai_failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN gr.status IN ('ai_graded','human_graded') THEN 1 ELSE 0 END) AS done
      FROM grading_results gr
      WHERE gr.ai_batch_id = ?
    `,
      [batchId]
    );

    const row = counts[0] || {};
    const num = (v) => {
      if (v == null) return 0;
      if (typeof v === 'bigint') return Number(v);
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    res.json({
      success: true,
      data: {
        taskId: Number(taskId),
        batchId: String(batchId),
        total: num(row.total),
        grading: num(row.grading),
        failed: num(row.failed),
        done: num(row.done),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取批次进度失败', error: error.message });
  }
};

const getGradingResult = async (req, res) => {
  try {
    const submissionId = req.params.submissionId;
    const [subRows] = await pool.query(
      `SELECT s.id, s.student_id, s.task_id FROM submissions s WHERE s.id = ? LIMIT 1`,
      [submissionId]
    );
    if (!subRows.length) {
      return res.status(404).json({ success: false, message: '提交不存在' });
    }
    const sub0 = subRows[0];
    const uid = toNumberOrNull(req.user.id);
    const subStudentId = toNumberOrNull(sub0.student_id);

    if (req.user.role === 'student' && subStudentId !== uid) {
      return res.status(403).json({ success: false, message: '无权查看该成绩' });
    }
    if (req.user.role === 'teacher') {
      const ok = await teacherOwnsSubmissionTask(req.user.id, submissionId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权查看该成绩' });
      }
    }
    if (req.user.role === 'enterprise') {
      const ok = await enterpriseOwnsSubmissionTask(req.user.id, submissionId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权查看该成绩' });
      }
    }

    const [rows] = await pool.query(
      `
      SELECT
        gr.id,
        gr.submission_id,
        gr.total_score,
        gr.dimension_scores,
        gr.ai_comment,
        gr.ai_problems,
        gr.ai_suggestions,
        gr.verification_result,
        gr.verification_teacher_override,
        gr.final_score,
        gr.human_score,
        gr.human_comment,
        gr.enterprise_score,
        gr.enterprise_comment,
        gr.enterprise_graded_by,
        gr.enterprise_graded_at,
        gr.graded_by,
        gr.graded_at,
        gr.status,
        s.task_id,
        s.student_id,
        s.submitted_at,
        s.content AS submission_content,
        s.file_path AS submission_file_path,
        s.file_name AS submission_file_name,
        s.file_type AS submission_file_type,
        s.revised_count AS submission_revised_count,
        t.title,
        t.max_score,
        t.max_submissions AS task_max_submissions,
        t.score_ai_weight,
        t.score_human_weight,
        t.campus_grade_weight,
        t.enterprise_grade_weight,
        u.real_name AS student_name
      FROM grading_results gr
      LEFT JOIN submissions s ON gr.submission_id = s.id
      LEFT JOIN tasks t ON s.task_id = t.id
      LEFT JOIN users u ON s.student_id = u.id
      WHERE gr.submission_id = ?
    `,
      [submissionId]
    );

    if (rows.length === 0) {
      return res.json({ success: true, data: null, message: '暂无批改结果' });
    }

    const result = rows[0];

    const mappedJoin = mapSubmissionFileName({
      file_name: result.submission_file_name,
      file_path: result.submission_file_path,
    });
    let subContent = result.submission_content;
    let subName = mappedJoin.file_name ?? result.submission_file_name ?? null;
    let subUrl = mappedJoin.file_url || null;
    let subType = result.submission_file_type || null;

    const textEmpty = subContent == null || String(subContent).trim() === '';
    if ((textEmpty || !subUrl) && result.submission_id) {
      const [subs] = await pool.query(
        'SELECT content, file_path, file_name, file_type FROM submissions WHERE id = ? LIMIT 1',
        [result.submission_id]
      );
      if (subs.length) {
        const sub = subs[0];
        if (textEmpty && sub.content != null) {
          subContent = sub.content;
        }
        if (!subUrl && sub.file_path) {
          const m2 = mapSubmissionFileName({ file_name: sub.file_name, file_path: sub.file_path });
          subUrl = m2.file_url || subUrl;
          subName = m2.file_name ?? subName;
        } else if (!subName && sub.file_name) {
          const m2 = mapSubmissionFileName({ file_name: sub.file_name, file_path: null });
          subName = m2.file_name ?? subName;
        }
        if (!subType && sub.file_type) {
          subType = sub.file_type;
        }
      }
    }

    result.submission_content = subContent;
    result.submission_file_name = subName;
    result.submission_file_url = subUrl;
    result.submission_file_type = subType;
    delete result.submission_file_path;

    result.dimension_scores = parseJsonField(result.dimension_scores);
    const vr = parseJsonField(result.verification_result);
    const vo = parseJsonField(result.verification_teacher_override);
    result.verification_result = vr;
    if (vo && typeof vo === 'object') {
      result.verification_teacher_override = vo;
      result.verification_merged = { ...vr, teacher_override: vo };
    }

    const systemW = await getSystemConfigs(['score_ai_weight', 'score_human_weight']);
    result.final_score =
      result.final_score != null
        ? Number(result.final_score)
        : buildFinalFromGradingRow(result, systemW);
    result.display_score =
      result.human_score != null && result.human_score !== ''
        ? result.final_score
        : result.total_score;
    delete result.score_ai_weight;
    delete result.score_human_weight;

    result.task_max_submissions = normalizeMaxSubmissions(result.task_max_submissions);
    result.submit_used_count = Number(result.submission_revised_count ?? 0) + 1;
    delete result.submission_revised_count;

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取批改结果失败', error: error.message });
  }
};

const humanReview = async (req, res) => {
  try {
    const { humanScore, humanComment } = req.body;

    if (req.user.role === 'teacher') {
      const ok = await teacherOwnsSubmissionTask(req.user.id, req.params.submissionId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权复核该提交' });
      }
    }

    const [rows] = await pool.query(
      `SELECT gr.id, gr.status FROM grading_results gr WHERE gr.submission_id = ?`,
      [req.params.submissionId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '批改结果不存在，请先执行 AI 批改' });
    }
    if (rows[0].status === 'ai_grading') {
      return res.status(400).json({ success: false, message: 'AI 批改进行中，请稍后再复核' });
    }

    if (humanComment) {
      const textR = await detectTextSafety(humanComment, { type: 'teacher_comment' });
      if (textR.riskLevel === 'blocked') {
        return res.status(400).json({ success: false, message: textR.reason || '评语包含不当内容' });
      }
    }

    await pool.query(
      `UPDATE grading_results SET human_score = ?, human_comment = ?, graded_by = ?, status = ?, graded_at = NOW() WHERE submission_id = ?`,
      [humanScore, humanComment, req.user.id, 'human_graded', req.params.submissionId]
    );

    const finalScore = await persistFinalScoreForSubmission(req.params.submissionId);

    const sidParam = req.params.submissionId;
    const [stuRows] = await pool.query(
      `SELECT s.student_id, t.title, s.task_id, t.class_id, t.created_by FROM submissions s JOIN tasks t ON s.task_id = t.id WHERE s.id = ?`,
      [sidParam]
    );
    if (stuRows.length) {
      const stuId = toNumberOrNull(stuRows[0].student_id);
      if (stuId != null) {
        safeNotify(
          notifyUser(stuId, {
            type: 'grade_final',
            title: '成绩已公布',
            body: `任务「${stuRows[0].title}」成绩已由教师复核公布，请查看最终成绩与评语。`,
            refType: 'submission',
            refId: Number(sidParam),
          })
        );
      }
      try {
        await cache.invalidateAfterGrading(stuRows[0].task_id, stuRows[0].created_by);
      } catch {
        /* ignore */
      }
    }

    try {
      if (stuRows.length) {
        const r0 = stuRows[0];
        rt.emitGradingProgress({
          classId: r0.class_id,
          taskId: r0.task_id,
          studentId: toNumberOrNull(r0.student_id),
          submissionId: Number(sidParam),
          action: 'human_graded',
        });
        rt.emitScores({
          classId: r0.class_id,
          userId: toNumberOrNull(r0.student_id),
          taskId: r0.task_id,
        });
      }
    } catch {
      /* ignore */
    }

    res.json({ success: true, message: '人工复核完成', data: { final_score: finalScore } });
  } catch (error) {
    res.status(500).json({ success: false, message: '复核失败', error: error.message });
  }
};

const enterpriseReview = async (req, res) => {
  try {
    const { enterpriseScore, enterpriseComment } = req.body;
    const sid = req.params.submissionId;

    if (req.user.role !== 'enterprise') {
      return res.status(403).json({ success: false, message: '仅企业导师可提交企业评分' });
    }
    const ok = await enterpriseOwnsSubmissionTask(req.user.id, sid);
    if (!ok) {
      return res.status(403).json({ success: false, message: '无权批改该提交' });
    }

    const [rows] = await pool.query(`SELECT id, status FROM grading_results WHERE submission_id = ?`, [sid]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '批改结果不存在，请先执行 AI 批改' });
    }
    if (rows[0].status === 'ai_grading') {
      return res.status(400).json({ success: false, message: 'AI 批改进行中，请稍后再评分' });
    }

    const scoreNum = Number(enterpriseScore);
    if (!Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      return res.status(400).json({ success: false, message: '企业评分须在 0–100 之间' });
    }

    if (enterpriseComment) {
      const textR = await detectTextSafety(enterpriseComment, { type: 'enterprise_comment' });
      if (textR.riskLevel === 'blocked') {
        return res.status(400).json({ success: false, message: textR.reason || '评语包含不当内容' });
      }
    }

    await pool.query(
      `UPDATE grading_results SET enterprise_score = ?, enterprise_comment = ?, enterprise_graded_by = ?, enterprise_graded_at = NOW() WHERE submission_id = ?`,
      [scoreNum, enterpriseComment, req.user.id, sid]
    );

    const finalScore = await persistFinalScoreForSubmission(sid);
    const [meta] = await pool.query(
      `SELECT s.task_id, t.created_by, t.class_id, s.student_id FROM submissions s JOIN tasks t ON s.task_id = t.id WHERE s.id = ?`,
      [sid]
    );
    if (meta.length) {
      try {
        await cache.invalidateAfterGrading(meta[0].task_id, meta[0].created_by);
      } catch {
        /* ignore */
      }
    }
    try {
      if (meta.length) {
        rt.emitGradingProgress({
          classId: meta[0].class_id,
          taskId: meta[0].task_id,
          studentId: meta[0].student_id,
          submissionId: Number(sid),
          action: 'enterprise_graded',
        });
        rt.emitScores({
          classId: meta[0].class_id,
          userId: meta[0].student_id,
          taskId: meta[0].task_id,
        });
      }
    } catch {
      /* ignore */
    }
    res.json({ success: true, message: '企业导师评分已保存', data: { final_score: finalScore } });
  } catch (error) {
    res.status(500).json({ success: false, message: '保存失败', error: error.message });
  }
};

const patchVerificationOverride = async (req, res) => {
  try {
    const sid = req.params.submissionId;
    const body = req.body?.verification_teacher_override ?? req.body;
    if (body == null || typeof body !== 'object') {
      return res.status(400).json({ success: false, message: '请提交 JSON 对象 verification_teacher_override' });
    }

    if (req.user.role === 'teacher') {
      const ok = await teacherOwnsSubmissionTask(req.user.id, sid);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权修改该核查结果' });
      }
    }

    const [rows] = await pool.query(`SELECT id FROM grading_results WHERE submission_id = ?`, [sid]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '批改结果不存在' });
    }

    await pool.query(`UPDATE grading_results SET verification_teacher_override = ? WHERE submission_id = ?`, [
      JSON.stringify(body),
      sid,
    ]);

    try {
      const [mr] = await pool.query(
        `SELECT t.class_id, s.task_id, s.student_id FROM submissions s JOIN tasks t ON s.task_id = t.id WHERE s.id = ?`,
        [sid]
      );
      if (mr.length) {
        rt.emitGradingProgress({
          classId: mr[0].class_id,
          taskId: mr[0].task_id,
          studentId: mr[0].student_id,
          submissionId: Number(sid),
          action: 'verification_override',
        });
      }
    } catch {
      /* ignore */
    }

    res.json({ success: true, message: '核查手工修正已保存' });
  } catch (error) {
    res.status(500).json({ success: false, message: '保存失败', error: error.message });
  }
};

const getStudentGradingResults = async (req, res) => {
  try {
    const [results] = await pool.query(
      `
      SELECT gr.*, s.task_id, t.title, t.max_score, t.score_ai_weight, t.score_human_weight,
             t.campus_grade_weight, t.enterprise_grade_weight, s.submitted_at
      FROM grading_results gr
      LEFT JOIN submissions s ON gr.submission_id = s.id
      LEFT JOIN tasks t ON s.task_id = t.id
      WHERE s.student_id = ?
      ORDER BY s.submitted_at DESC
    `,
      [req.user.id]
    );

    const systemW = await getSystemConfigs(['score_ai_weight', 'score_human_weight']);

    const formattedResults = results.map((row) => {
      const { score_ai_weight, score_human_weight, ...result } = row;
      const fs = result.final_score != null ? Number(result.final_score) : buildFinalFromGradingRow(row, systemW);
      return {
        ...result,
        dimension_scores: parseJsonField(result.dimension_scores),
        verification_result: parseJsonField(result.verification_result),
        final_score: fs,
        displayScore: fs != null ? fs : Number(result.total_score),
      };
    });

    res.json({ success: true, data: formattedResults });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取批改结果失败', error: error.message });
  }
};

module.exports = {
  aiGradeSubmission,
  batchAiGrade,
  getEligibleSubmissions,
  getBatchGradingProgress,
  getGradingResult,
  humanReview,
  enterpriseReview,
  patchVerificationOverride,
  getStudentGradingResults,
};
