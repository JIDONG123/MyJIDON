/**
 * 考试交卷异步队列（进程内单 worker，与 gradingQueue 类似，削峰）
 */
const pool = require('../config/database');
const { scoreObjective } = require('./qbObjectiveScore');
const cache = require('./cacheService');
const { sealExamAttemptIfNeeded } = require('./qbScoreSeal');
const { enqueueSubjectiveAi } = require('./qbAiQueue');
const { mergeAttemptScores } = require('./qbAttemptMerge');

async function recomputeExamRanks(examId) {
  /** 已交卷即参与排名（含待批改主观题），按当前总分排序，避免班级名次长期为「—」 */
  const [rows] = await pool.query(
    `SELECT * FROM qb_exam_attempts WHERE exam_id = ? AND submitted_at IS NOT NULL`,
    [examId]
  );
  const scored = rows
    .map((r) => {
      const m = mergeAttemptScores(r);
      return { id: m.id, total: Number(m.total_score) || 0 };
    })
    .sort((a, b) => b.total - a.total || a.id - b.id);
  let rk = 1;
  for (let i = 0; i < scored.length; i += 1) {
    if (i > 0 && scored[i].total < scored[i - 1].total) rk = i + 1;
    await pool.query(`UPDATE qb_exam_attempts SET rank_in_class = ? WHERE id = ?`, [rk, scored[i].id]);
  }
}

const queue = [];
let processing = false;

function parseJsonField(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

async function finalizeExamAttempt(attemptId) {
  const [at] = await pool.query(
    `SELECT a.* FROM qb_exam_attempts a WHERE a.id = ? LIMIT 1`,
    [attemptId]
  );
  if (!at.length) return;
  const attempt = at[0];
  if (attempt.status !== 'submitted') return;

  const draft = parseJsonField(attempt.draft_json) || {};
  const answers = draft.answers || {};

  const [eqs] = await pool.query(
    `SELECT eq.id AS eq_id, eq.score, q.type, q.answer_json, q.default_score
     FROM qb_exam_questions eq
     JOIN qb_questions q ON q.id = eq.question_id AND q.deleted_at IS NULL
     WHERE eq.exam_id = ?
     ORDER BY eq.sort_order, eq.id`,
    [attempt.exam_id]
  );

  let objective = 0;
  const per = {};
  let hasSubjective = false;

  for (const row of eqs) {
    const key = String(row.eq_id);
    const max = Number(row.score) || Number(row.default_score) || 0;
    const q = { type: row.type, answer_json: row.answer_json };
    const sa = answers[key];
    const r = scoreObjective(q, sa, max);
    if (r.auto) {
      objective += r.earned;
      per[key] = { earned: r.earned, max: r.max, auto: true };
    } else {
      hasSubjective = true;
      per[key] = { earned: null, max: r.max, auto: false, pending: true };
    }
  }

  const status = hasSubjective ? 'submitted' : 'graded';
  await pool.query(
    `UPDATE qb_exam_attempts SET objective_score = ?, subjective_score = 0, total_score = ?, per_question_scores = ?, status = ? WHERE id = ?`,
    [objective, objective, JSON.stringify(per), status, attemptId]
  );
  await recomputeExamRanks(attempt.exam_id);
  if (!hasSubjective) {
    await sealExamAttemptIfNeeded(attemptId);
  } else {
    enqueueSubjectiveAi('exam', attemptId);
  }

  try {
    await cache.invalidateQbExam(attempt.exam_id);
  } catch {
    /* ignore */
  }

  try {
    const rt = require('./realtimeEmit');
    const [xr] = await pool.query(`SELECT class_id FROM qb_exams WHERE id = ? LIMIT 1`, [attempt.exam_id]);
    if (xr.length) {
      rt.emitExam(xr[0].class_id, attempt.exam_id, 'attempt_scored', { attemptId });
    }
  } catch {
    /* ignore */
  }
}

async function processJob(attemptId) {
  try {
    await finalizeExamAttempt(attemptId);
  } catch (e) {
    console.error('[examSubmitQueue]', attemptId, e);
  }
}

function schedule() {
  if (processing) return;
  const attemptId = queue.shift();
  if (!attemptId) return;
  processing = true;
  processJob(attemptId)
    .catch((e) => console.error('[examSubmitQueue] fatal', e))
    .finally(() => {
      processing = false;
      setImmediate(schedule);
    });
}

function enqueueExamFinalize(attemptId) {
  queue.push(attemptId);
  schedule();
}

module.exports = { enqueueExamFinalize, finalizeExamAttempt, recomputeExamRanks };
