const pool = require('../config/database');
const { gradeSubmission } = require('./aiGrading');
const { getSystemConfigs } = require('./llmClient');
const { safeNotify, notifyUser } = require('./notify');
const { buildRagQueryText, retrieveTeacherKbContext } = require('./ragRetrieve');
const { buildFinalFromGradingRow } = require('./gradingFinal');
const cache = require('./cacheService');

const PRIORITY_SINGLE = 1;
const PRIORITY_BATCH = 2;
const MAX_ATTEMPTS = 3;

const queue = [];
let processing = false;

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

async function runSingleGrading(submissionId) {
  const [submissions] = await pool.query(
    `
      SELECT s.id, s.student_id, s.content, s.archive_extracted_text, s.file_name, s.task_id, t.title, t.requirements, t.scoring_criteria,
             t.scenario_type, t.enterprise_standard,
             t.evaluation_metrics, t.max_score, t.score_ai_weight, t.score_human_weight,
             t.campus_grade_weight, t.enterprise_grade_weight, t.step_checklist, t.difficulty_level,
             t.created_by AS task_created_by, t.class_id AS task_class_id,
             gr.human_score AS existing_human_score, gr.enterprise_score AS existing_enterprise_score
      FROM submissions s
      LEFT JOIN tasks t ON s.task_id = t.id
      LEFT JOIN grading_results gr ON s.id = gr.submission_id
      WHERE s.id = ?
    `,
    [submissionId]
  );

  if (submissions.length === 0) {
    throw new Error('提交不存在');
  }

  const submission = submissions[0];
  const workText =
    (submission.archive_extracted_text != null &&
      String(submission.archive_extracted_text).trim()) ||
    submission.content ||
    submission.file_name;
  const task = {
    title: submission.title,
    requirements: submission.requirements,
    scoring_criteria: submission.scoring_criteria,
    scenario_type: submission.scenario_type,
    enterprise_standard: submission.enterprise_standard,
    evaluation_metrics: parseJsonField(submission.evaluation_metrics),
    max_score: submission.max_score,
    step_checklist: parseJsonField(submission.step_checklist),
    difficulty_level: submission.difficulty_level,
  };

  const ragQuery = buildRagQueryText(task, workText);
  const ragContext = await retrieveTeacherKbContext(submission.task_created_by, ragQuery);
  const gradingResult = await gradeSubmission(task, workText, {
    ragContext,
    submissionFileName: submission.file_name,
    gradingProgressMeta: {
      submissionId: Number(submissionId),
      classId: submission.task_class_id,
      taskId: submission.task_id,
      studentId: submission.student_id,
    },
  });

  const [existing] = await pool.query('SELECT id, human_score FROM grading_results WHERE submission_id = ?', [
    submissionId,
  ]);
  const human = existing.length ? existing[0].human_score : null;

  if (existing.length > 0) {
    await pool.query(
      `UPDATE grading_results SET
          total_score = ?, dimension_scores = ?, ai_comment = ?, ai_problems = ?, ai_suggestions = ?,
          verification_result = ?, status = ?, graded_at = NOW()
         WHERE submission_id = ?`,
      [
        gradingResult.totalScore,
        JSON.stringify(gradingResult.dimensionScores),
        gradingResult.comment,
        gradingResult.problems,
        gradingResult.suggestions,
        JSON.stringify(gradingResult.verification || {}),
        human != null ? 'human_graded' : 'ai_graded',
        submissionId,
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO grading_results (
          submission_id, total_score, dimension_scores, ai_comment, ai_problems, ai_suggestions,
          verification_result, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        submissionId,
        gradingResult.totalScore,
        JSON.stringify(gradingResult.dimensionScores),
        gradingResult.comment,
        gradingResult.problems,
        gradingResult.suggestions,
        JSON.stringify(gradingResult.verification || {}),
        'ai_graded',
      ]
    );
  }

  const finalScore = await persistFinalScoreForSubmission(submissionId);

  const stuId = toNumberOrNull(submission.student_id);
  if (stuId != null) {
    safeNotify(
      notifyUser(stuId, {
        type: 'grade_ai',
        title: '作业已 AI 批改',
        body: `任务「${submission.title}」的实训成果已完成 AI 批改，请查看成绩与报告。`,
        refType: 'submission',
        refId: Number(submissionId),
      })
    );
  }

  try {
    await cache.invalidateAfterGrading(submission.task_id, submission.task_created_by);
  } catch {
    /* ignore */
  }

  try {
    const rt = require('./realtimeEmit');
    rt.emitGradingProgress({
      classId: submission.task_class_id,
      taskId: submission.task_id,
      studentId: submission.student_id,
      submissionId: Number(submissionId),
      action: 'ai_done',
    });
    rt.emitScores({
      classId: submission.task_class_id,
      userId: submission.student_id,
      taskId: submission.task_id,
    });
  } catch {
    /* ignore */
  }

  return { gradingResult, finalScore, taskId: submission.task_id, taskCreatedBy: submission.task_created_by };
}

async function markGradingFailed(submissionId, errMsg) {
  const msg = String(errMsg || '未知错误').slice(0, 500);
  await pool.query(
    `UPDATE grading_results SET status = 'ai_failed', ai_comment = ?, graded_at = NOW() WHERE submission_id = ?`,
    [`批改失败：${msg}`, submissionId]
  );
  const [rows] = await pool.query(
    `SELECT s.task_id, t.created_by AS task_created_by FROM submissions s JOIN tasks t ON s.task_id = t.id WHERE s.id = ?`,
    [submissionId]
  );
  if (rows.length) {
    try {
      await cache.invalidateAfterGrading(rows[0].task_id, rows[0].task_created_by);
    } catch {
      /* ignore */
    }
    try {
      const rt = require('./realtimeEmit');
      const [m2] = await pool.query(
        `SELECT s.student_id, t.class_id FROM submissions s JOIN tasks t ON s.task_id = t.id WHERE s.id = ?`,
        [submissionId]
      );
      if (m2.length) {
        rt.emitGradingProgress({
          classId: m2[0].class_id,
          taskId: rows[0].task_id,
          studentId: m2[0].student_id,
          submissionId: Number(submissionId),
          action: 'ai_failed',
        });
      }
    } catch {
      /* ignore */
    }
  }
}

async function processJob(job) {
  let attempt = 0;
  let lastErr = null;
  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    try {
      await runSingleGrading(job.submissionId);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  await markGradingFailed(job.submissionId, lastErr && lastErr.message);
}

function enqueue(job) {
  queue.push(job);
  queue.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.enqueuedAt - b.enqueuedAt;
  });
  schedule();
}

function schedule() {
  if (processing) {
    return;
  }
  const job = queue.shift();
  if (!job) {
    return;
  }
  processing = true;
  processJob(job)
    .catch((e) => {
      console.error('[gradingQueue] job error', job.submissionId, e);
    })
    .finally(() => {
      processing = false;
      setImmediate(schedule);
    });
}

function enqueueSingle(submissionId) {
  enqueue({
    type: 'single',
    submissionId: Number(submissionId),
    priority: PRIORITY_SINGLE,
    enqueuedAt: Date.now(),
  });
}

function enqueueBatchItem(submissionId) {
  enqueue({
    type: 'batch',
    submissionId: Number(submissionId),
    priority: PRIORITY_BATCH,
    enqueuedAt: Date.now(),
  });
}

module.exports = {
  enqueueSingle,
  enqueueBatchItem,
  PRIORITY_SINGLE,
  PRIORITY_BATCH,
};
