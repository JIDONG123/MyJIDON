const pool = require('../config/database');
const { teacherManagesClass, getStudentClassId } = require('../utils/accessControl');
const { scoreObjective } = require('../utils/qbObjectiveScore');
const { recordUsage } = require('./qbQuestionController');
const { mergeAttemptScores } = require('../utils/qbAttemptMerge');
const { sealPracticeAttemptIfNeeded } = require('../utils/qbScoreSeal');
const { enqueueSubjectiveAi } = require('../utils/qbAiQueue');
const { persistUnsealPracticeAttemptIfReady } = require('../utils/qbScoreUnseal');
const { runStudentPython } = require('../utils/qbCodeRunner');

function toInt(v) {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
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

async function scorePracticeAttempt(practiceId, attemptId) {
  const [items] = await pool.query(
    `SELECT pq.id AS pq_id, pq.score_override, q.type, q.answer_json, q.default_score
     FROM qb_practice_questions pq
     JOIN qb_questions q ON q.id = pq.question_id AND q.deleted_at IS NULL
     WHERE pq.practice_id = ?
     ORDER BY pq.sort_order, pq.id`,
    [practiceId]
  );
  const [at] = await pool.query(`SELECT answers_json, per_question_scores FROM qb_practice_attempts WHERE id = ?`, [attemptId]);
  if (!at.length) return;
  const answers = parseJson(at[0].answers_json) || {};
  const existingPer = parseJson(at[0].per_question_scores) || {};

  let objective = 0;
  const per = { ...existingPer };

  for (const row of items) {
    const key = String(row.pq_id);
    const max = Number(row.score_override) || Number(row.default_score) || 0;
    const q = { type: row.type, answer_json: row.answer_json };
    const r = scoreObjective(q, answers[key], max);
    if (r.auto) {
      objective += r.earned;
      per[key] = { earned: r.earned, max: r.max, auto: true };
    } else if (!per[key]) {
      per[key] = { earned: null, max: r.max, auto: false, pending: true };
    } else {
      per[key].max = r.max;
      per[key].auto = false;
      if (per[key].earned == null) per[key].pending = true;
    }
  }

  let subjective = 0;
  for (const p of Object.values(per)) {
    if (p && p.auto === false && Number.isFinite(Number(p.earned))) {
      subjective += Number(p.earned);
    }
  }

  const total = objective + subjective;
  await pool.query(
    `UPDATE qb_practice_attempts SET objective_score = ?, subjective_score = ?, total_score = ?, per_question_scores = ? WHERE id = ?`,
    [objective, subjective, total, JSON.stringify(per), attemptId]
  );
}

async function listTeacherPractices(req, res) {
  try {
    const classId = toInt(req.query.classId);
    if (!classId) return res.status(400).json({ success: false, message: '缺少 classId' });
    const ok = await teacherManagesClass(req.user.id, classId);
    if (!ok) return res.status(403).json({ success: false, message: '无权管理该班级' });
    const [rows] = await pool.query(
      `SELECT p.*, (SELECT COUNT(*) FROM qb_practice_questions pq WHERE pq.practice_id = p.id) AS question_count
       FROM qb_practices p WHERE p.class_id = ? AND p.teacher_id = ? ORDER BY p.id DESC`,
      [classId, req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: '加载失败' });
  }
}

async function createPractice(req, res) {
  const conn = await pool.getConnection();
  try {
    const b = req.body || {};
    const classId = toInt(b.classId);
    const ok = await teacherManagesClass(req.user.id, classId);
    if (!ok) return res.status(403).json({ success: false, message: '无权管理该班级' });
    const title = String(b.title || '').trim();
    if (!title) return res.status(400).json({ success: false, message: '请填写练习名称' });
    const [r] = await conn.query(
      `INSERT INTO qb_practices (teacher_id, class_id, title, description, deadline_at, publish_scores_at, shuffle_options, status, pick_rules)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        classId,
        title,
        b.description || null,
        b.deadline_at || null,
        b.publish_scores_at || null,
        b.shuffle_options ? 1 : 0,
        b.status === 'draft' ? 'draft' : 'published',
        b.pick_rules ? JSON.stringify(b.pick_rules) : null,
      ]
    );
    res.status(201).json({ success: true, id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: '创建失败' });
  } finally {
    conn.release();
  }
}

async function updatePractice(req, res) {
  try {
    const id = toInt(req.params.id);
    const [p] = await pool.query(`SELECT * FROM qb_practices WHERE id = ? AND teacher_id = ?`, [id, req.user.id]);
    if (!p.length) return res.status(404).json({ success: false, message: '不存在' });
    const b = req.body || {};
    await pool.query(
      `UPDATE qb_practices SET title = ?, description = ?, deadline_at = ?, publish_scores_at = ?, shuffle_options = ?, status = ? WHERE id = ? AND teacher_id = ?`,
      [
        b.title != null ? String(b.title).trim() : p[0].title,
        b.description !== undefined ? b.description : p[0].description,
        b.deadline_at !== undefined ? b.deadline_at : p[0].deadline_at,
        b.publish_scores_at !== undefined ? b.publish_scores_at : p[0].publish_scores_at,
        b.shuffle_options != null ? (b.shuffle_options ? 1 : 0) : p[0].shuffle_options,
        b.status || p[0].status,
        id,
        req.user.id,
      ]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: '更新失败' });
  }
}

async function deletePractice(req, res) {
  try {
    const id = toInt(req.params.id);
    await pool.query(`DELETE FROM qb_question_usage WHERE ref_type = 'practice' AND ref_id = ?`, [id]);
    await pool.query(`DELETE FROM qb_practices WHERE id = ? AND teacher_id = ?`, [id, req.user.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: '删除失败' });
  }
}

async function getPracticeTeacher(req, res) {
  try {
    const id = toInt(req.params.id);
    const [p] = await pool.query(`SELECT * FROM qb_practices WHERE id = ? AND teacher_id = ?`, [id, req.user.id]);
    if (!p.length) return res.status(404).json({ success: false, message: '不存在' });
    const [qs] = await pool.query(
      `SELECT pq.id AS pq_id, pq.sort_order, pq.score_override, q.*
       FROM qb_practice_questions pq
       JOIN qb_questions q ON q.id = pq.question_id AND q.deleted_at IS NULL
       WHERE pq.practice_id = ?
       ORDER BY pq.sort_order, pq.id`,
      [id]
    );
    res.json({ success: true, data: { practice: p[0], questions: qs } });
  } catch (e) {
    res.status(500).json({ success: false, message: '加载失败' });
  }
}

async function setPracticeQuestions(req, res) {
  const conn = await pool.getConnection();
  try {
    const id = toInt(req.params.id);
    const [p] = await conn.query(`SELECT class_id FROM qb_practices WHERE id = ? AND teacher_id = ?`, [id, req.user.id]);
    if (!p.length) return res.status(404).json({ success: false, message: '不存在' });
    const ids = Array.isArray(req.body?.questionIds) ? req.body.questionIds.map((x) => toInt(x)).filter((x) => x) : [];
    await conn.beginTransaction();
    await conn.query(`DELETE FROM qb_practice_questions WHERE practice_id = ?`, [id]);
    await conn.query(`DELETE FROM qb_question_usage WHERE ref_type = 'practice' AND ref_id = ?`, [id]);
    let order = 0;
    for (const qid of ids) {
      const [qrows] = await conn.query(`SELECT id FROM qb_questions WHERE id = ? AND teacher_id = ? AND deleted_at IS NULL`, [
        qid,
        req.user.id,
      ]);
      if (!qrows.length) continue;
      await conn.query(
        `INSERT INTO qb_practice_questions (practice_id, question_id, sort_order, score_override) VALUES (?, ?, ?, NULL)`,
        [id, qid, order]
      );
      await recordUsage(conn, qid, 'practice', id);
      order += 1;
    }
    await conn.commit();
    res.json({ success: true, count: order });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ success: false, message: '保存题目失败' });
  } finally {
    conn.release();
  }
}

async function listStudentPractices(req, res) {
  try {
    const cid = await getStudentClassId(req.user.id);
    if (cid == null) return res.json({ success: true, data: [] });
    const [rows] = await pool.query(
      `SELECT p.id, p.title, p.deadline_at, p.publish_scores_at, p.status,
              a.id AS attempt_id, a.status AS my_status, a.total_score, a.submitted_at, a.score_bundle_cipher
       FROM qb_practices p
       LEFT JOIN qb_practice_attempts a ON a.practice_id = p.id AND a.student_id = ?
       WHERE p.class_id = ? AND p.status = 'published'
       ORDER BY p.id DESC`,
      [req.user.id, cid]
    );
    for (const row of rows) {
      if (row.attempt_id) await persistUnsealPracticeAttemptIfReady(row.attempt_id, row.publish_scores_at);
    }
    const [rows2] = await pool.query(
      `SELECT p.id, p.title, p.deadline_at, p.publish_scores_at, p.status,
              a.id AS attempt_id, a.status AS my_status, a.total_score, a.submitted_at, a.score_bundle_cipher
       FROM qb_practices p
       LEFT JOIN qb_practice_attempts a ON a.practice_id = p.id AND a.student_id = ?
       WHERE p.class_id = ? AND p.status = 'published'
       ORDER BY p.id DESC`,
      [req.user.id, cid]
    );
    const now = new Date();
    const data = rows2.map((row) => {
      const pub = row.publish_scores_at ? new Date(row.publish_scores_at) : null;
      let total = row.total_score;
      if (pub && now < pub) total = null;
      else if (row.score_bundle_cipher) total = mergeAttemptScores(row).total_score;
      const { score_bundle_cipher, attempt_id, ...rest } = row;
      const dl = row.deadline_at ? new Date(row.deadline_at) : null;
      const deadlinePassed = !!(dl && !Number.isNaN(dl.getTime()) && now > dl);
      const submitted = !!row.submitted_at;
      /** take=可作答；review=已交仅可查看；closed=已截止且未交，不可进入 */
      let student_take_state = 'take';
      if (submitted) student_take_state = 'review';
      else if (deadlinePassed) student_take_state = 'closed';
      return { ...rest, total_score: total, deadline_passed: deadlinePassed, student_take_state };
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: '加载失败' });
  }
}

async function getStudentPracticePaper(req, res) {
  try {
    const id = toInt(req.params.id);
    const cid = await getStudentClassId(req.user.id);
    const [p] = await pool.query(`SELECT * FROM qb_practices WHERE id = ? AND class_id = ? AND status = 'published'`, [
      id,
      cid,
    ]);
    if (!p.length) return res.status(404).json({ success: false, message: '练习不存在或未发布' });
    const dl = p[0].deadline_at ? new Date(p[0].deadline_at) : null;
    const deadlinePassed = !!(dl && !Number.isNaN(dl.getTime()) && new Date() > dl);
    const [qs] = await pool.query(
      `SELECT pq.id AS pq_id, pq.score_override, q.id AS question_id, q.type, q.stem, q.options_json, q.default_score
       FROM qb_practice_questions pq
       JOIN qb_questions q ON q.id = pq.question_id AND q.deleted_at IS NULL
       WHERE pq.practice_id = ?
       ORDER BY pq.sort_order, pq.id`,
      [id]
    );
    let [at] = await pool.query(`SELECT * FROM qb_practice_attempts WHERE practice_id = ? AND student_id = ?`, [
      id,
      req.user.id,
    ]);
    if (deadlinePassed && (!at.length || !at[0].submitted_at)) {
      return res.status(403).json({
        success: false,
        code: 'DEADLINE_CLOSED',
        message: '已超过截止时间，无法继续作答',
      });
    }
    if (at.length) {
      await persistUnsealPracticeAttemptIfReady(at[0].id, p[0].publish_scores_at);
      const [at2] = await pool.query(`SELECT * FROM qb_practice_attempts WHERE practice_id = ? AND student_id = ?`, [
        id,
        req.user.id,
      ]);
      at = at2;
    }
    let attemptOut = at[0] || null;
    if (attemptOut) {
      const pub = p[0].publish_scores_at ? new Date(p[0].publish_scores_at) : null;
      if (pub && new Date() < pub) {
        attemptOut = {
          ...attemptOut,
          objective_score: null,
          subjective_score: null,
          total_score: null,
          per_question_scores: null,
          score_bundle_cipher: null,
          ai_suggestion: null,
        };
      } else if (attemptOut.score_bundle_cipher) {
        const m = mergeAttemptScores(attemptOut);
        let aiParsed = null;
        if (m.ai_suggestion) {
          aiParsed = typeof m.ai_suggestion === 'string' ? parseJson(m.ai_suggestion) : m.ai_suggestion;
        }
        attemptOut = {
          ...m,
          per_question_scores: parseJson(m.per_question_scores),
          ai_suggestion: aiParsed,
        };
        delete attemptOut.score_bundle_cipher;
      } else if (attemptOut.ai_suggestion) {
        attemptOut = {
          ...attemptOut,
          ai_suggestion:
            typeof attemptOut.ai_suggestion === 'string' ? parseJson(attemptOut.ai_suggestion) : attemptOut.ai_suggestion,
        };
      }
    }
    res.json({
      success: true,
      data: {
        practice: p[0],
        questions: qs.map((r) => ({
          pq_id: r.pq_id,
          question_id: r.question_id,
          type: r.type,
          stem: r.stem,
          options_json: parseJson(r.options_json),
          max_score: Number(r.score_override) || Number(r.default_score) || 0,
        })),
        attempt: attemptOut,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: '加载失败' });
  }
}

async function submitPractice(req, res) {
  const conn = await pool.getConnection();
  try {
    const id = toInt(req.params.id);
    const cid = await getStudentClassId(req.user.id);
    const [p] = await conn.query(`SELECT * FROM qb_practices WHERE id = ? AND class_id = ? AND status = 'published'`, [
      id,
      cid,
    ]);
    if (!p.length) return res.status(404).json({ success: false, message: '练习不存在' });
    if (p[0].deadline_at && new Date(p[0].deadline_at) < new Date()) {
      return res.status(400).json({ success: false, message: '已超过截止时间' });
    }
    const answers = req.body?.answers;
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ success: false, message: '缺少 answers 对象' });
    }
    await conn.beginTransaction();
    const [ex] = await conn.query(`SELECT id FROM qb_practice_attempts WHERE practice_id = ? AND student_id = ?`, [
      id,
      req.user.id,
    ]);
    let attemptId;
    if (ex.length) {
      attemptId = ex[0].id;
      await conn.query(
        `UPDATE qb_practice_attempts SET answers_json = ?, status = 'submitted', submitted_at = NOW() WHERE id = ?`,
        [JSON.stringify(answers), attemptId]
      );
    } else {
      const [ins] = await conn.query(
        `INSERT INTO qb_practice_attempts (practice_id, student_id, answers_json, status, submitted_at)
         VALUES (?, ?, ?, 'submitted', NOW())`,
        [id, req.user.id, JSON.stringify(answers)]
      );
      attemptId = ins.insertId;
    }
    await conn.commit();
    await scorePracticeAttempt(id, attemptId);
    const [subCnt] = await pool.query(
      `SELECT COUNT(*) AS c FROM qb_practice_questions pq
       JOIN qb_questions q ON q.id = pq.question_id AND q.deleted_at IS NULL
       WHERE pq.practice_id = ? AND q.type IN ('short','code')`,
      [id]
    );
    if (!Number(subCnt[0].c)) {
      await pool.query(`UPDATE qb_practice_attempts SET status = 'graded', graded_at = NOW() WHERE id = ?`, [attemptId]);
      await sealPracticeAttemptIfNeeded(attemptId);
    } else {
      enqueueSubjectiveAi('practice', attemptId);
    }
    res.json({ success: true, attemptId });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ success: false, message: '提交失败' });
  } finally {
    conn.release();
  }
}

async function savePracticeDraft(req, res) {
  try {
    const id = toInt(req.params.id);
    const cid = await getStudentClassId(req.user.id);
    const [p] = await pool.query(
      `SELECT id, deadline_at FROM qb_practices WHERE id = ? AND class_id = ? AND status = 'published'`,
      [id, cid]
    );
    if (!p.length) return res.status(404).json({ success: false, message: '练习不存在' });
    if (p[0].deadline_at) {
      const dlx = new Date(p[0].deadline_at);
      if (!Number.isNaN(dlx.getTime()) && new Date() > dlx) {
        const [ex0] = await pool.query(`SELECT submitted_at FROM qb_practice_attempts WHERE practice_id = ? AND student_id = ?`, [
          id,
          req.user.id,
        ]);
        if (!ex0.length || !ex0[0].submitted_at) {
          return res.status(400).json({ success: false, message: '已超过截止时间' });
        }
      }
    }
    const answers = req.body?.answers || {};
    const [ex] = await pool.query(`SELECT id, status FROM qb_practice_attempts WHERE practice_id = ? AND student_id = ?`, [
      id,
      req.user.id,
    ]);
    if (ex.length && ex[0].status === 'submitted') {
      return res.status(400).json({ success: false, message: '已提交不可修改' });
    }
    if (ex.length) {
      await pool.query(`UPDATE qb_practice_attempts SET answers_json = ?, status = 'in_progress' WHERE id = ?`, [
        JSON.stringify(answers),
        ex[0].id,
      ]);
    } else {
      await pool.query(
        `INSERT INTO qb_practice_attempts (practice_id, student_id, answers_json, status) VALUES (?, ?, ?, 'in_progress')`,
        [id, req.user.id, JSON.stringify(answers)]
      );
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: '保存失败' });
  }
}

async function listPracticeAttempts(req, res) {
  try {
    const id = toInt(req.params.id);
    const [p] = await pool.query(`SELECT class_id, publish_scores_at FROM qb_practices WHERE id = ? AND teacher_id = ?`, [
      id,
      req.user.id,
    ]);
    if (!p.length) return res.status(404).json({ success: false, message: '不存在' });
    const pubAt = p[0].publish_scores_at;
    const [rows] = await pool.query(
      `SELECT a.*, u.real_name, u.username, u.student_no
       FROM qb_practice_attempts a
       JOIN users u ON u.id = a.student_id
       WHERE a.practice_id = ?
       ORDER BY a.submitted_at DESC, a.id DESC`,
      [id]
    );
    for (const r of rows) {
      await persistUnsealPracticeAttemptIfReady(r.id, pubAt);
    }
    const [rows2] = await pool.query(
      `SELECT a.*, u.real_name, u.username, u.student_no
       FROM qb_practice_attempts a
       JOIN users u ON u.id = a.student_id
       WHERE a.practice_id = ?
       ORDER BY a.submitted_at DESC, a.id DESC`,
      [id]
    );
    const data = rows2.map((r) => {
      const m = mergeAttemptScores(r);
      let aiParsed = null;
      if (m.ai_suggestion) {
        aiParsed = typeof m.ai_suggestion === 'string' ? parseJson(m.ai_suggestion) : m.ai_suggestion;
      }
      const { score_bundle_cipher, ...rest } = m;
      return { ...rest, per_question_scores: parseJson(m.per_question_scores), ai_suggestion: aiParsed };
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: '加载失败' });
  }
}

async function adoptPracticeAiScores(req, res) {
  try {
    const pid = toInt(req.params.id);
    const aid = toInt(req.params.attemptId);
    const [p] = await pool.query(`SELECT id FROM qb_practices WHERE id = ? AND teacher_id = ?`, [pid, req.user.id]);
    if (!p.length) return res.status(404).json({ success: false, message: '不存在' });
    const keysFilter = Array.isArray(req.body?.pqIds) ? req.body.pqIds.map((x) => String(x)) : null;
    const [at] = await pool.query(`SELECT * FROM qb_practice_attempts WHERE id = ? AND practice_id = ?`, [aid, pid]);
    if (!at.length) return res.status(404).json({ success: false, message: '作答不存在' });
    const m = mergeAttemptScores(at[0]);
    const per = parseJson(m.per_question_scores) || {};
    const keys = keysFilter && keysFilter.length ? keysFilter : Object.keys(per);
    for (const k of keys) {
      const cur = per[k];
      if (!cur || cur.ai_suggested_score == null || !Number.isFinite(Number(cur.ai_suggested_score))) continue;
      if (cur.earned != null && Number.isFinite(Number(cur.earned)) && !cur.pending) continue;
      per[k] = { ...cur, earned: Number(cur.ai_suggested_score), pending: false, auto: false };
    }
    const hasPending = Object.values(per).some(
      (x) => x && x.auto === false && (x.earned == null || !Number.isFinite(Number(x.earned)) || x.pending)
    );
    const status = hasPending ? 'submitted' : 'graded';
    await pool.query(
      `UPDATE qb_practice_attempts SET per_question_scores = ?, status = ?, graded_at = IF(? = 'graded', COALESCE(graded_at, NOW()), graded_at), score_bundle_cipher = NULL WHERE id = ?`,
      [JSON.stringify(per), status, status, aid]
    );
    await scorePracticeAttempt(pid, aid);
    await sealPracticeAttemptIfNeeded(aid);
    res.json({ success: true, data: { status } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: '采纳失败' });
  }
}

async function studentRunPracticeCode(req, res) {
  try {
    const id = toInt(req.params.id);
    const pqId = toInt(req.body?.pq_id);
    const code = req.body?.code;
    if (!pqId) return res.status(400).json({ success: false, message: '缺少 pq_id' });
    if (code == null || String(code).length > 100000) {
      return res.status(400).json({ success: false, message: '代码过长' });
    }
    const cid = await getStudentClassId(req.user.id);
    const [p] = await pool.query(`SELECT id, deadline_at FROM qb_practices WHERE id = ? AND class_id = ? AND status = 'published'`, [
      id,
      cid,
    ]);
    if (!p.length) return res.status(404).json({ success: false, message: '练习不存在' });
    if (p[0].deadline_at && new Date(p[0].deadline_at) < new Date()) {
      return res.status(400).json({ success: false, message: '已超过截止时间' });
    }
    const [qrow] = await pool.query(
      `SELECT q.type FROM qb_practice_questions pq JOIN qb_questions q ON q.id = pq.question_id AND q.deleted_at IS NULL WHERE pq.id = ? AND pq.practice_id = ?`,
      [pqId, id]
    );
    if (!qrow.length || qrow[0].type !== 'code') {
      return res.status(400).json({ success: false, message: '该题不是编程题或未加入本题练习' });
    }
    const result = await runStudentPython(String(code));
    res.json({ success: true, data: result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: '运行失败' });
  }
}

async function gradePracticeAttempt(req, res) {
  try {
    const pid = toInt(req.params.id);
    const aid = toInt(req.params.attemptId);
    const [p] = await pool.query(`SELECT id FROM qb_practices WHERE id = ? AND teacher_id = ?`, [pid, req.user.id]);
    if (!p.length) return res.status(404).json({ success: false, message: '不存在' });
    const scores = req.body?.subjectiveScores;
    if (!scores || typeof scores !== 'object') {
      return res.status(400).json({ success: false, message: '缺少 subjectiveScores { pq_id: 分数 }' });
    }
    const [at] = await pool.query(`SELECT * FROM qb_practice_attempts WHERE id = ? AND practice_id = ?`, [aid, pid]);
    if (!at.length) return res.status(404).json({ success: false, message: '作答不存在' });
    const merged = mergeAttemptScores(at[0]);
    const per = parseJson(merged.per_question_scores) || {};
    for (const [k, v] of Object.entries(scores)) {
      const earned = Number(v);
      if (!Number.isFinite(earned) || earned < 0) continue;
      const cur = per[k] || {};
      per[k] = { ...cur, earned, auto: false, pending: false };
    }
    await pool.query(
      `UPDATE qb_practice_attempts SET per_question_scores = ?, status = 'graded', graded_at = NOW(), score_bundle_cipher = NULL WHERE id = ?`,
      [JSON.stringify(per), aid]
    );
    await scorePracticeAttempt(pid, aid);
    await sealPracticeAttemptIfNeeded(aid);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: '批改失败' });
  }
}

module.exports = {
  listTeacherPractices,
  createPractice,
  updatePractice,
  deletePractice,
  getPracticeTeacher,
  setPracticeQuestions,
  listStudentPractices,
  getStudentPracticePaper,
  submitPractice,
  savePracticeDraft,
  listPracticeAttempts,
  gradePracticeAttempt,
  adoptPracticeAiScores,
  studentRunPracticeCode,
};
