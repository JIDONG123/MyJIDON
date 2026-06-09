/**
 * 主观题 AI 建议异步队列（进程内单 worker）
 * 将建议分写入 per_question_scores.*.ai_suggested_score 供教师一键采纳
 */
const pool = require('../config/database');
const { suggestSubjectiveScore } = require('./qbSubjectiveAi');

const queue = [];
let processing = false;

function parseJson(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

async function processPracticeAttempt(attemptId) {
  const [at] = await pool.query(
    `SELECT a.id, a.practice_id, a.answers_json, a.per_question_scores FROM qb_practice_attempts a WHERE a.id = ?`,
    [attemptId]
  );
  if (!at.length) return;
  const answers = parseJson(at[0].answers_json) || {};
  let per = parseJson(at[0].per_question_scores) || {};
  const [items] = await pool.query(
    `SELECT pq.id AS pq_id, pq.score_override, q.type, q.stem, q.reference_answer, q.default_score
     FROM qb_practice_questions pq
     JOIN qb_questions q ON q.id = pq.question_id AND q.deleted_at IS NULL
     WHERE pq.practice_id = ? AND q.type IN ('short','code')
     ORDER BY pq.sort_order`,
    [at[0].practice_id]
  );
  const suggestions = [];
  for (const row of items) {
    const key = String(row.pq_id);
    const max = Number(row.score_override) || Number(row.default_score) || 0;
    const sug = await suggestSubjectiveScore({
      stem: row.stem,
      referenceAnswer: row.reference_answer,
      studentAnswer: answers[key],
      maxScore: max,
      questionType: row.type,
    });
    if (sug) {
      suggestions.push({ pq_id: key, ...sug });
      const base = per[key] && typeof per[key] === 'object' ? per[key] : {};
      per[key] = {
        ...base,
        max: base.max != null ? base.max : max,
        auto: false,
        pending: base.earned == null,
        ai_suggested_score: sug.suggested_score,
        ai_rationale: (sug.rationale || '').slice(0, 800),
      };
    }
  }
  if (suggestions.length) {
    await pool.query(`UPDATE qb_practice_attempts SET per_question_scores = ?, ai_suggestion = ? WHERE id = ?`, [
      JSON.stringify(per),
      JSON.stringify({ items: suggestions, at: new Date().toISOString() }),
      attemptId,
    ]);
  }
  try {
    const { emitQbPracticeAudience } = require('./qbAudience');
    const [pr] = await pool.query(
      `SELECT class_id, teaching_class_id, id AS practice_id FROM qb_practices WHERE id = ? LIMIT 1`,
      [at[0].practice_id]
    );
    if (pr.length) {
      await emitQbPracticeAudience(pr[0], pr[0].practice_id, 'ai_suggestion', { attemptId });
    }
  } catch {
    /* ignore */
  }
}

async function processExamAttempt(attemptId) {
  const [at] = await pool.query(
    `SELECT a.id, a.exam_id, a.draft_json, a.per_question_scores FROM qb_exam_attempts a WHERE a.id = ?`,
    [attemptId]
  );
  if (!at.length) return;
  const draft = parseJson(at[0].draft_json) || {};
  const answers = draft.answers || {};
  let per = parseJson(at[0].per_question_scores) || {};
  const [items] = await pool.query(
    `SELECT eq.id AS eq_id, eq.score, q.type, q.stem, q.reference_answer, q.default_score
     FROM qb_exam_questions eq
     JOIN qb_questions q ON q.id = eq.question_id AND q.deleted_at IS NULL
     WHERE eq.exam_id = ? AND q.type IN ('short','code')
     ORDER BY eq.sort_order`,
    [at[0].exam_id]
  );
  const suggestions = [];
  for (const row of items) {
    const key = String(row.eq_id);
    const max = Number(row.score) || Number(row.default_score) || 0;
    const sug = await suggestSubjectiveScore({
      stem: row.stem,
      referenceAnswer: row.reference_answer,
      studentAnswer: answers[key],
      maxScore: max,
      questionType: row.type,
    });
    if (sug) {
      suggestions.push({ eq_id: key, ...sug });
      const base = per[key] && typeof per[key] === 'object' ? per[key] : {};
      per[key] = {
        ...base,
        max: base.max != null ? base.max : max,
        auto: false,
        pending: base.earned == null,
        ai_suggested_score: sug.suggested_score,
        ai_rationale: (sug.rationale || '').slice(0, 800),
      };
    }
  }
  if (suggestions.length) {
    await pool.query(`UPDATE qb_exam_attempts SET per_question_scores = ?, ai_suggestion = ? WHERE id = ?`, [
      JSON.stringify(per),
      JSON.stringify({ items: suggestions, at: new Date().toISOString() }),
      attemptId,
    ]);
  }
  try {
    const { emitQbExamAudience } = require('./qbAudience');
    const [er] = await pool.query(
      `SELECT class_id, teaching_class_id, id AS exam_id FROM qb_exams WHERE id = ? LIMIT 1`,
      [at[0].exam_id]
    );
    if (er.length) {
      await emitQbExamAudience(er[0], er[0].exam_id, 'ai_suggestion', { attemptId });
    }
  } catch {
    /* ignore */
  }
}

async function runJob(job) {
  if (job.kind === 'practice') await processPracticeAttempt(job.id);
  else if (job.kind === 'exam') await processExamAttempt(job.id);
}

function schedule() {
  if (processing) return;
  const job = queue.shift();
  if (!job) return;
  processing = true;
  runJob(job)
    .catch((e) => console.error('[qbAiQueue]', job, e))
    .finally(() => {
      processing = false;
      setImmediate(schedule);
    });
}

function enqueueSubjectiveAi(kind, attemptId) {
  queue.push({ kind, id: attemptId });
  schedule();
}

module.exports = { enqueueSubjectiveAi };
