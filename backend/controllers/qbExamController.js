const pool = require("../config/database");
const cache = require("../utils/cacheService");
const { clientIp } = require("../utils/rateLimiter");
const {
  resolveTeacherListAudience,
  resolveTeacherCreateAudience,
  teacherListWhere,
  studentAudienceContext,
  studentVisibilityWhere,
  getPublishedExamForStudent,
  emitQbExamAudience,
} = require("../utils/qbAudience");
const { recordUsage } = require("./qbQuestionController");
const { scoreObjective } = require("../utils/qbObjectiveScore");
const {
  enqueueExamFinalize,
  recomputeExamRanks,
} = require("../utils/examSubmitQueue");
const { buildScoresExportBuffer } = require("../utils/qbExcel");
const { mergeAttemptScores } = require("../utils/qbAttemptMerge");
const { sealExamAttemptIfNeeded } = require("../utils/qbScoreSeal");
const { persistUnsealExamAttemptIfReady } = require("../utils/qbScoreUnseal");
const { runStudentPython } = require("../utils/qbCodeRunner");

function toInt(v) {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function parseJson(val) {
  if (val == null) return null;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function checkIpAllowlist(allowStr, ip) {
  if (!allowStr || !String(allowStr).trim()) return true;
  const parts = String(allowStr)
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.includes(ip);
}

async function listTeacherExams(req, res) {
  try {
    const aud = await resolveTeacherListAudience(req);
    if (!aud.ok) {
      return res.status(aud.status).json({ success: false, message: aud.message });
    }
    const where = teacherListWhere("qb_exams", aud);
    const [rows] = await pool.query(
      `SELECT * FROM qb_exams WHERE ${where.clause} AND teacher_id = ? ORDER BY id DESC`,
      [...where.params, req.user.id],
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "加载失败" });
  }
}

async function createExam(req, res) {
  try {
    const b = req.body || {};
    const aud = await resolveTeacherCreateAudience(req);
    if (!aud.ok) {
      return res.status(aud.status).json({ success: false, message: aud.message });
    }
    const title = String(b.title || "").trim();
    if (!title)
      return res
        .status(400)
        .json({ success: false, message: "请填写考试名称" });
    const [r] = await pool.query(
      `INSERT INTO qb_exams (teacher_id, class_id, teaching_class_id, title, instructions, start_at, end_at, duration_minutes, early_submit_minutes,
        shuffle_questions, shuffle_options, randomize, random_pick_rules, anti_tab_switch, tab_switch_limit, ip_allowlist, publish_scores_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        aud.classId,
        aud.teachingClassId,
        title,
        b.instructions || null,
        b.start_at,
        b.end_at,
        toInt(b.duration_minutes) || 90,
        toInt(b.early_submit_minutes) || 0,
        b.shuffle_questions ? 1 : 0,
        b.shuffle_options ? 1 : 0,
        b.randomize ? 1 : 0,
        b.random_pick_rules ? JSON.stringify(b.random_pick_rules) : null,
        b.anti_tab_switch ? 1 : 0,
        toInt(b.tab_switch_limit) || 3,
        b.ip_allowlist || null,
        b.publish_scores_at || null,
        b.status === "draft" ? "draft" : "published",
      ],
    );
    await cache.invalidateQbExam(r.insertId);
    try {
      await emitQbExamAudience(
        { class_id: aud.classId, teaching_class_id: aud.teachingClassId },
        r.insertId,
        "create",
      );
    } catch (_) {}
    res.status(201).json({ success: true, id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "创建失败" });
  }
}

async function updateExam(req, res) {
  try {
    const id = toInt(req.params.id);
    const [ex] = await pool.query(
      `SELECT * FROM qb_exams WHERE id = ? AND teacher_id = ?`,
      [id, req.user.id],
    );
    if (!ex.length)
      return res.status(404).json({ success: false, message: "不存在" });
    const b = req.body || {};
    await pool.query(
      `UPDATE qb_exams SET title = ?, instructions = ?, start_at = ?, end_at = ?, duration_minutes = ?, early_submit_minutes = ?,
        shuffle_questions = ?, shuffle_options = ?, randomize = ?, random_pick_rules = ?, anti_tab_switch = ?, tab_switch_limit = ?, ip_allowlist = ?, publish_scores_at = ?, status = ?
       WHERE id = ? AND teacher_id = ?`,
      [
        b.title != null ? String(b.title).trim() : ex[0].title,
        b.instructions !== undefined ? b.instructions : ex[0].instructions,
        b.start_at || ex[0].start_at,
        b.end_at || ex[0].end_at,
        toInt(b.duration_minutes) || ex[0].duration_minutes,
        b.early_submit_minutes != null
          ? toInt(b.early_submit_minutes)
          : ex[0].early_submit_minutes,
        b.shuffle_questions != null
          ? b.shuffle_questions
            ? 1
            : 0
          : ex[0].shuffle_questions,
        b.shuffle_options != null
          ? b.shuffle_options
            ? 1
            : 0
          : ex[0].shuffle_options,
        b.randomize != null ? (b.randomize ? 1 : 0) : ex[0].randomize,
        b.random_pick_rules !== undefined
          ? b.random_pick_rules == null
            ? null
            : JSON.stringify(b.random_pick_rules)
          : ex[0].random_pick_rules != null &&
              typeof ex[0].random_pick_rules === "object"
            ? JSON.stringify(ex[0].random_pick_rules)
            : ex[0].random_pick_rules,
        b.anti_tab_switch != null
          ? b.anti_tab_switch
            ? 1
            : 0
          : ex[0].anti_tab_switch,
        b.tab_switch_limit != null
          ? toInt(b.tab_switch_limit)
          : ex[0].tab_switch_limit,
        b.ip_allowlist !== undefined ? b.ip_allowlist : ex[0].ip_allowlist,
        b.publish_scores_at !== undefined
          ? b.publish_scores_at
          : ex[0].publish_scores_at,
        b.status || ex[0].status,
        id,
        req.user.id,
      ],
    );
    await cache.invalidateQbExam(id);
    try {
      await emitQbExamAudience(ex[0], id, "update");
    } catch (_) {}
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "更新失败" });
  }
}

async function deleteExam(req, res) {
  try {
    const id = toInt(req.params.id);
    const [ex2] = await pool.query(
      `SELECT * FROM qb_exams WHERE id = ? AND teacher_id = ?`,
      [id, req.user.id],
    );
    await pool.query(
      `DELETE FROM qb_question_usage WHERE ref_type = 'exam' AND ref_id = ?`,
      [id],
    );
    await pool.query(`DELETE FROM qb_exams WHERE id = ? AND teacher_id = ?`, [
      id,
      req.user.id,
    ]);
    await cache.invalidateQbExam(id);
    try {
      if (ex2.length) await emitQbExamAudience(ex2[0], id, "delete");
    } catch (_) {}
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "删除失败" });
  }
}

async function getExamTeacher(req, res) {
  try {
    const id = toInt(req.params.id);
    const [ex] = await pool.query(
      `SELECT * FROM qb_exams WHERE id = ? AND teacher_id = ?`,
      [id, req.user.id],
    );
    if (!ex.length)
      return res.status(404).json({ success: false, message: "不存在" });
    const [qs] = await pool.query(
      `SELECT eq.*, q.type, q.stem, q.difficulty, q.options_json, q.answer_json, q.default_score
       FROM qb_exam_questions eq JOIN qb_questions q ON q.id = eq.question_id AND q.deleted_at IS NULL
       WHERE eq.exam_id = ? ORDER BY eq.sort_order, eq.id`,
      [id],
    );
    res.json({ success: true, data: { exam: ex[0], questions: qs } });
  } catch (e) {
    res.status(500).json({ success: false, message: "加载失败" });
  }
}

async function setExamQuestions(req, res) {
  const conn = await pool.getConnection();
  try {
    const id = toInt(req.params.id);
    const [ex] = await conn.query(
      `SELECT id FROM qb_exams WHERE id = ? AND teacher_id = ?`,
      [id, req.user.id],
    );
    if (!ex.length)
      return res.status(404).json({ success: false, message: "不存在" });
    const list = Array.isArray(req.body?.items) ? req.body.items : [];
    await conn.beginTransaction();
    await conn.query(`DELETE FROM qb_exam_questions WHERE exam_id = ?`, [id]);
    await conn.query(
      `DELETE FROM qb_question_usage WHERE ref_type = 'exam' AND ref_id = ?`,
      [id],
    );
    let order = 0;
    for (const it of list) {
      const qid = toInt(it.questionId);
      const score = Number(it.score) > 0 ? Number(it.score) : null;
      const [qrows] = await conn.query(
        `SELECT id FROM qb_questions WHERE id = ? AND teacher_id = ? AND deleted_at IS NULL`,
        [qid, req.user.id],
      );
      if (!qrows.length) continue;
      await conn.query(
        `INSERT INTO qb_exam_questions (exam_id, question_id, sort_order, score) VALUES (?, ?, ?, COALESCE(?, (SELECT default_score FROM qb_questions WHERE id = ?)))`,
        [id, qid, order, score, qid],
      );
      await recordUsage(conn, qid, "exam", id);
      order += 1;
    }
    await conn.commit();
    await cache.invalidateQbExam(id);
    try {
      const [exm] = await pool.query(
        `SELECT class_id, teaching_class_id FROM qb_exams WHERE id = ? LIMIT 1`,
        [id],
      );
      if (exm.length)
        await emitQbExamAudience(exm[0], id, "questions_saved", { count: order });
    } catch (_) {}
    res.json({ success: true, count: order });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ success: false, message: "保存失败" });
  } finally {
    conn.release();
  }
}

function phaseForExam(exam, now = new Date()) {
  const start = new Date(exam.start_at);
  const end = new Date(exam.end_at);
  if (exam.status !== "published")
    return { phase: "hidden", message: "考试未发布" };
  if (now < start)
    return {
      phase: "upcoming",
      message: "考试未开始",
      start_at: exam.start_at,
      end_at: exam.end_at,
    };
  if (now > end) return { phase: "ended", message: "考试已结束" };
  return { phase: "active", message: "考试进行中" };
}

async function listStudentExams(req, res) {
  try {
    const ctx = await studentAudienceContext(req.user.id);
    const vis = studentVisibilityWhere("e", ctx);
    if (vis.clause === "0") return res.json({ success: true, data: [] });
    const qRaw =
      req.query?.q != null ? String(req.query.q).trim().slice(0, 80) : "";
    const titleLike = qRaw ? `%${qRaw}%` : null;
    const baseParams = titleLike
      ? [req.user.id, ...vis.params, titleLike]
      : [req.user.id, ...vis.params];
    const titleClause = titleLike ? " AND e.title LIKE ?" : "";
    const [rows] = await pool.query(
      `SELECT e.*, a.id AS attempt_id, a.status AS my_status, a.submitted_at, a.started_at, a.total_score, a.score_bundle_cipher
       FROM qb_exams e
       LEFT JOIN qb_exam_attempts a ON a.exam_id = e.id AND a.student_id = ?
       WHERE ${vis.clause} AND e.status = 'published'${titleClause}
       ORDER BY e.start_at DESC`,
      baseParams,
    );
    for (const row of rows) {
      if (row.attempt_id)
        await persistUnsealExamAttemptIfReady(
          row.attempt_id,
          row.publish_scores_at,
        );
    }
    const [rows2] = await pool.query(
      `SELECT e.*, a.id AS attempt_id, a.status AS my_status, a.submitted_at, a.started_at, a.total_score, a.score_bundle_cipher
       FROM qb_exams e
       LEFT JOIN qb_exam_attempts a ON a.exam_id = e.id AND a.student_id = ?
       WHERE ${vis.clause} AND e.status = 'published'${titleClause}
       ORDER BY e.start_at DESC`,
      baseParams,
    );
    const now = new Date();
    const data = rows2.map((e) => {
      const pub = e.publish_scores_at ? new Date(e.publish_scores_at) : null;
      let total = e.total_score;
      if (pub && now < pub) total = null;
      else if (e.score_bundle_cipher) total = mergeAttemptScores(e).total_score;
      const { score_bundle_cipher, attempt_id, ...rest } = e;
      return { ...rest, total_score: total, phase: phaseForExam(e, now) };
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: "加载失败" });
  }
}

async function studentExamMeta(req, res) {
  try {
    const id = toInt(req.params.id);
    /** 学生端阶段依赖当前时间，避免缓存导致「列表显示可考但 start 返回 400」不一致 */
    const exam = await getPublishedExamForStudent(id, req.user.id);
    if (!exam) {
      return res.status(404).json({ success: false, message: '考试不存在' });
    }
    const now = new Date();
    const ph = phaseForExam(exam, now);
    return res.json({
      success: true,
      data: {
        exam: {
          id: exam.id,
          title: exam.title,
          start_at: exam.start_at,
          end_at: exam.end_at,
          duration_minutes: exam.duration_minutes,
          instructions: exam.instructions,
          shuffle_options: !!exam.shuffle_options,
        },
        phase: ph,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: '加载失败' });
  }
}

async function startExam(req, res) {
  try {
    const id = toInt(req.params.id);
    const ip = clientIp(req);
    const exRow = await getPublishedExamForStudent(id, req.user.id);
    if (!exRow)
      return res.status(404).json({ success: false, message: "考试不存在" });
    const ex = [exRow];
    if (!checkIpAllowlist(ex[0].ip_allowlist, ip)) {
      return res
        .status(403)
        .json({ success: false, message: "当前网络环境不允许参加本场考试" });
    }
    const ph = phaseForExam(ex[0]);
    if (ph.phase === "upcoming") {
      return res
        .status(400)
        .json({
          success: false,
          code: "NOT_STARTED",
          message: "考试尚未开始",
          data: ph,
        });
    }
    if (ph.phase === "ended") {
      return res
        .status(400)
        .json({ success: false, code: "ENDED", message: "考试已结束" });
    }

    const [eqs] = await pool.query(
      `SELECT eq.id AS eq_id, eq.score, q.id AS qid, q.type, q.stem, q.options_json, q.default_score
       FROM qb_exam_questions eq
       JOIN qb_questions q ON q.id = eq.question_id AND q.deleted_at IS NULL
       WHERE eq.exam_id = ?
       ORDER BY eq.sort_order, eq.id`,
      [id],
    );
    if (!eqs.length) {
      return res
        .status(400)
        .json({
          success: false,
          code: "NO_QUESTIONS",
          message: "试卷未配置题目",
        });
    }

    let orderRows = eqs.map((r) => ({ ...r }));
    if (ex[0].shuffle_questions) shuffleInPlace(orderRows);

    const now = new Date();
    const endTime = new Date(ex[0].end_at);
    const durMs = Number(ex[0].duration_minutes) * 60000;
    const expires = new Date(
      Math.min(now.getTime() + durMs, endTime.getTime()),
    );

    const paper = orderRows.map((r) => ({
      eq_id: r.eq_id,
      question_id: r.qid,
      type: r.type,
      stem: r.stem,
      options_json: parseJson(r.options_json),
      max_score: Number(r.score) || Number(r.default_score) || 0,
    }));

    const [exist] = await pool.query(
      `SELECT * FROM qb_exam_attempts WHERE exam_id = ? AND student_id = ?`,
      [id, req.user.id],
    );
    const draft = {
      v: 1,
      order: paper.map((p) => ({ eq_id: p.eq_id, question_id: p.question_id })),
      answers: {},
    };

    if (exist.length) {
      if (exist[0].submitted_at) {
        return res.status(400).json({ success: false, code: 'ALREADY_SUBMITTED', message: '已交卷，无法重新开始' });
      }
      const prev = parseJson(exist[0].draft_json) || {};
      const mergedDraft = { ...draft, answers: prev.answers || {} };
      await pool.query(
        `UPDATE qb_exam_attempts SET started_at = COALESCE(started_at, NOW()), attempt_expires_at = ?, draft_json = ?, last_saved_at = NOW(), status = 'in_progress' WHERE id = ?`,
        [expires, JSON.stringify(mergedDraft), exist[0].id]
      );
      paper.forEach((p) => {
        if (mergedDraft.answers && mergedDraft.answers[String(p.eq_id)] !== undefined) {
          p.my_answer = mergedDraft.answers[String(p.eq_id)];
        }
      });
      return res.json({
        success: true,
        data: {
          attemptId: exist[0].id,
          attempt_expires_at: expires,
          paper,
          tab_switch_count: exist[0].tab_switch_count,
          shuffle_options: !!ex[0].shuffle_options,
        },
      });
    }

    const [ins] = await pool.query(
      `INSERT INTO qb_exam_attempts (exam_id, student_id, started_at, attempt_expires_at, draft_json, status, last_saved_at)
       VALUES (?, ?, NOW(), ?, ?, 'in_progress', NOW())`,
      [id, req.user.id, expires, JSON.stringify(draft)],
    );
    res.json({
      success: true,
      data: {
        attemptId: ins.insertId,
        attempt_expires_at: expires,
        paper,
        tab_switch_count: 0,
        shuffle_options: !!ex[0].shuffle_options,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "开始考试失败" });
  }
}

async function autosaveExam(req, res) {
  try {
    const id = toInt(req.params.id);
    const exam = await getPublishedExamForStudent(id, req.user.id);
    if (!exam)
      return res.status(404).json({ success: false, message: "未开始考试" });
    const [at] = await pool.query(
      `SELECT a.* FROM qb_exam_attempts a WHERE a.exam_id = ? AND a.student_id = ?`,
      [id, req.user.id],
    );
    if (!at.length)
      return res.status(404).json({ success: false, message: "未开始考试" });
    if (at[0].submitted_at)
      return res.status(400).json({ success: false, message: "已交卷" });
    const draft = parseJson(at[0].draft_json) || {
      v: 1,
      order: [],
      answers: {},
    };
    draft.answers = { ...draft.answers, ...(req.body?.answers || {}) };
    await pool.query(
      `UPDATE qb_exam_attempts SET draft_json = ?, last_saved_at = NOW() WHERE id = ?`,
      [JSON.stringify(draft), at[0].id],
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "保存失败" });
  }
}

async function tabEventExam(req, res) {
  try {
    const id = toInt(req.params.id);
    const exam = await getPublishedExamForStudent(id, req.user.id);
    if (!exam)
      return res
        .status(404)
        .json({ success: false, message: "无进行中的答卷" });
    const [rows] = await pool.query(
      `SELECT a.id, a.tab_switch_count, e.anti_tab_switch, e.tab_switch_limit, u.real_name, u.username
       FROM qb_exam_attempts a
       JOIN qb_exams e ON e.id = a.exam_id
       JOIN users u ON u.id = a.student_id
       WHERE a.exam_id = ? AND a.student_id = ? AND a.submitted_at IS NULL`,
      [id, req.user.id],
    );
    if (!rows.length)
      return res
        .status(404)
        .json({ success: false, message: "无进行中的答卷" });
    const r = rows[0];
    const cnt = Number(r.tab_switch_count) + 1;
    await pool.query(
      `UPDATE qb_exam_attempts SET tab_switch_count = ? WHERE id = ?`,
      [cnt, r.id],
    );
    let autoSubmitted = false;
    if (r.anti_tab_switch && cnt >= Number(r.tab_switch_limit)) {
      await pool.query(
        `UPDATE qb_exam_attempts SET submitted_at = NOW(), auto_submit_reason = '切屏超限', status = 'submitted' WHERE id = ?`,
        [r.id],
      );
      enqueueExamFinalize(r.id);
      autoSubmitted = true;
    }
    try {
      const { emitExamMonitorTab } = require("../socket/examLiveSocket");
      emitExamMonitorTab(id, {
        studentId: req.user.id,
        displayName:
          (r.real_name && String(r.real_name).trim()) || r.username || "学生",
        tabCount: cnt,
        at: new Date().toISOString(),
        autoSubmitted,
      });
    } catch (_) {}
    res.json({ success: true, data: { tab_switch_count: cnt, autoSubmitted } });
  } catch (e) {
    res.status(500).json({ success: false, message: "记录失败" });
  }
}

async function submitExam(req, res) {
  try {
    const id = toInt(req.params.id);
    const ip = clientIp(req);
    const exRow = await getPublishedExamForStudent(id, req.user.id);
    if (!exRow)
      return res.status(404).json({ success: false, message: "考试不存在" });
    const ex = [exRow];
    if (!checkIpAllowlist(ex[0].ip_allowlist, ip)) {
      return res
        .status(403)
        .json({ success: false, message: "当前网络环境不允许提交" });
    }
    const now = Date.now();
    const endMs = new Date(ex[0].end_at).getTime();
    if (now > endMs)
      return res
        .status(400)
        .json({ success: false, message: "已超过考试结束时间" });
    const earlyMs = (Number(ex[0].early_submit_minutes) || 0) * 60000;
    if (earlyMs > 0 && now < endMs - earlyMs) {
      return res.status(400).json({
        success: false,
        message: `考试结束前 ${ex[0].early_submit_minutes} 分钟内才允许交卷`,
      });
    }

    const [at] = await pool.query(
      `SELECT * FROM qb_exam_attempts WHERE exam_id = ? AND student_id = ?`,
      [id, req.user.id],
    );
    if (!at.length)
      return res.status(400).json({ success: false, message: "请先开始考试" });
    if (at[0].submitted_at)
      return res.status(400).json({ success: false, message: "已交卷" });
    if (
      at[0].attempt_expires_at &&
      new Date(at[0].attempt_expires_at) < new Date()
    ) {
      await pool.query(
        `UPDATE qb_exam_attempts SET submitted_at = NOW(), auto_submit_reason = '时间到', status = 'submitted' WHERE id = ?`,
        [at[0].id],
      );
      enqueueExamFinalize(at[0].id);
      try {
        const [xr] = await pool.query(
          `SELECT class_id, teaching_class_id FROM qb_exams WHERE id = ? LIMIT 1`,
          [id],
        );
        if (xr.length)
          await emitQbExamAudience(xr[0], id, "auto_submit_tab", {
            studentId: req.user.id,
          });
      } catch (_) {}
      return res.json({ success: true, data: { closed: true } });
    }

    if (req.body?.answers && typeof req.body.answers === "object") {
      const draft = parseJson(at[0].draft_json) || {
        v: 1,
        order: [],
        answers: {},
      };
      draft.answers = { ...draft.answers, ...req.body.answers };
      await pool.query(
        `UPDATE qb_exam_attempts SET draft_json = ? WHERE id = ?`,
        [JSON.stringify(draft), at[0].id],
      );
    }

    await pool.query(
      `UPDATE qb_exam_attempts SET submitted_at = NOW(), status = 'submitted' WHERE id = ?`,
      [at[0].id],
    );
    enqueueExamFinalize(at[0].id);
    try {
      await emitQbExamAudience(ex[0], id, "submit", {
        studentId: req.user.id,
        attemptId: at[0].id,
      });
    } catch (_) {}
    res.json({ success: true, message: "交卷已受理，客观题成绩计算中" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "交卷失败" });
  }
}

async function buildStudentExamBreakdown(examId, perMap) {
  const [eqs] = await pool.query(
    `SELECT eq.id AS eq_id, eq.sort_order, q.type, q.stem,
            COALESCE(eq.score, q.default_score) AS max_score
     FROM qb_exam_questions eq
     JOIN qb_questions q ON q.id = eq.question_id AND q.deleted_at IS NULL
     WHERE eq.exam_id = ?
     ORDER BY eq.sort_order, eq.id`,
    [examId],
  );
  const breakdown = [];
  const byType = {};
  let idx = 0;
  for (const row of eqs) {
    idx += 1;
    const key = String(row.eq_id);
    const cell = (perMap && perMap[key]) || {};
    const max = Number(row.max_score) || 0;
    const earnedRaw = cell.earned;
    const earnedNum =
      earnedRaw != null && Number.isFinite(Number(earnedRaw))
        ? Number(earnedRaw)
        : null;
    const type = row.type || "unknown";
    if (!byType[type]) byType[type] = { type, earned: 0, max: 0, count: 0 };
    byType[type].max += max;
    byType[type].count += 1;
    if (earnedNum != null) byType[type].earned += earnedNum;
    const stemStr = row.stem != null ? String(row.stem) : "";
    breakdown.push({
      sort_index: idx,
      eq_id: row.eq_id,
      type,
      stem_short: stemStr.length > 120 ? `${stemStr.slice(0, 120)}…` : stemStr,
      earned: earnedNum,
      max,
      pending: !!cell.pending,
      auto: !!cell.auto,
    });
  }
  return { breakdown, scores_by_type: Object.values(byType) };
}

async function studentExamResult(req, res) {
  try {
    const id = toInt(req.params.id);
    const exam = await getPublishedExamForStudent(id, req.user.id);
    if (!exam)
      return res.status(404).json({ success: false, message: "不存在" });
    const pub = exam.publish_scores_at
      ? new Date(exam.publish_scores_at)
      : null;
    if (pub && new Date() < pub) {
      return res.json({
        success: true,
        data: {
          visible: false,
          message: `成绩将于 ${exam.publish_scores_at} 公布`,
        },
      });
    }
    const [at] = await pool.query(
      `SELECT * FROM qb_exam_attempts WHERE exam_id = ? AND student_id = ?`,
      [id, req.user.id],
    );
    if (!at.length || !at[0].submitted_at) {
      return res.json({
        success: true,
        data: { visible: false, message: "暂无成绩或未交卷" },
      });
    }
    await persistUnsealExamAttemptIfReady(at[0].id, exam.publish_scores_at);
    const [at2] = await pool.query(
      `SELECT * FROM qb_exam_attempts WHERE exam_id = ? AND student_id = ?`,
      [id, req.user.id],
    );
    const merged = mergeAttemptScores(at2[0]);
    let aiParsed = null;
    if (merged.ai_suggestion) {
      aiParsed =
        typeof merged.ai_suggestion === "string"
          ? parseJson(merged.ai_suggestion)
          : merged.ai_suggestion;
    }
    const per = parseJson(merged.per_question_scores) || {};
    const { breakdown, scores_by_type } = await buildStudentExamBreakdown(
      id,
      per,
    );
    res.json({
      success: true,
      data: {
        visible: true,
        total_score: merged.total_score,
        objective_score: merged.objective_score,
        subjective_score: merged.subjective_score,
        rank_in_class: merged.rank_in_class,
        per_question_scores: per,
        breakdown,
        scores_by_type,
        ai_suggestion: aiParsed,
        submitted_at: merged.submitted_at,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "查询失败" });
  }
}

async function listExamAttempts(req, res) {
  try {
    const id = toInt(req.params.id);
    const [ex] = await pool.query(
      `SELECT id, publish_scores_at FROM qb_exams WHERE id = ? AND teacher_id = ?`,
      [id, req.user.id],
    );
    if (!ex.length)
      return res.status(404).json({ success: false, message: "不存在" });
    const pubAt = ex[0].publish_scores_at;
    const [rows] = await pool.query(
      `SELECT a.*, u.real_name, u.username, u.student_no FROM qb_exam_attempts a
       JOIN users u ON u.id = a.student_id WHERE a.exam_id = ? ORDER BY (a.rank_in_class IS NULL) ASC, a.rank_in_class ASC, a.total_score DESC, a.id ASC`,
      [id],
    );
    for (const r of rows) {
      await persistUnsealExamAttemptIfReady(r.id, pubAt);
    }
    const [rows2] = await pool.query(
      `SELECT a.*, u.real_name, u.username, u.student_no FROM qb_exam_attempts a
       JOIN users u ON u.id = a.student_id WHERE a.exam_id = ? ORDER BY (a.rank_in_class IS NULL) ASC, a.rank_in_class ASC, a.total_score DESC, a.id ASC`,
      [id],
    );
    const data = rows2.map((r) => {
      const m = mergeAttemptScores(r);
      let aiParsed = null;
      if (m.ai_suggestion) {
        aiParsed =
          typeof m.ai_suggestion === "string"
            ? parseJson(m.ai_suggestion)
            : m.ai_suggestion;
      }
      const { score_bundle_cipher, draft_json, ...rest } = m;
      const draft = parseJson(draft_json) || {};
      return {
        ...rest,
        per_question_scores: parseJson(m.per_question_scores),
        ai_suggestion: aiParsed,
        answers:
          draft.answers && typeof draft.answers === "object"
            ? draft.answers
            : {},
      };
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: "加载失败" });
  }
}

async function gradeExamAttempt(req, res) {
  try {
    const eid = toInt(req.params.id);
    const aid = toInt(req.params.attemptId);
    const [ex] = await pool.query(
      `SELECT id FROM qb_exams WHERE id = ? AND teacher_id = ?`,
      [eid, req.user.id],
    );
    if (!ex.length)
      return res.status(404).json({ success: false, message: "不存在" });
    const scores = req.body?.subjectiveScores;
    if (!scores || typeof scores !== "object") {
      return res
        .status(400)
        .json({
          success: false,
          message: "缺少 subjectiveScores { eq_id: 分数 }",
        });
    }
    const [at] = await pool.query(
      `SELECT * FROM qb_exam_attempts WHERE id = ? AND exam_id = ?`,
      [aid, eid],
    );
    if (!at.length)
      return res.status(404).json({ success: false, message: "作答不存在" });
    const mergedRow = mergeAttemptScores(at[0]);
    const per = parseJson(mergedRow.per_question_scores) || {};
    const obj = Number(mergedRow.objective_score) || 0;
    for (const [k, v] of Object.entries(scores)) {
      const earned = Number(v);
      if (!Number.isFinite(earned) || earned < 0) continue;
      const cur = per[k] || {};
      per[k] = { ...cur, earned, auto: false, pending: false };
    }
    let subj = 0;
    for (const p of Object.values(per)) {
      if (
        p &&
        p.auto === false &&
        p.earned != null &&
        Number.isFinite(Number(p.earned))
      ) {
        subj += Number(p.earned);
      }
    }
    const total = obj + subj;
    await pool.query(
      `UPDATE qb_exam_attempts SET per_question_scores = ?, subjective_score = ?, total_score = ?, status = 'graded', score_bundle_cipher = NULL WHERE id = ?`,
      [JSON.stringify(per), subj, total, aid],
    );
    await recomputeExamRanks(eid);
    await sealExamAttemptIfNeeded(aid);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "批改失败" });
  }
}

async function adoptExamAiScores(req, res) {
  try {
    const eid = toInt(req.params.id);
    const aid = toInt(req.params.attemptId);
    const [ex] = await pool.query(
      `SELECT id FROM qb_exams WHERE id = ? AND teacher_id = ?`,
      [eid, req.user.id],
    );
    if (!ex.length)
      return res.status(404).json({ success: false, message: "不存在" });
    const keysFilter = Array.isArray(req.body?.eqIds)
      ? req.body.eqIds.map((x) => String(x))
      : null;
    const [at] = await pool.query(
      `SELECT * FROM qb_exam_attempts WHERE id = ? AND exam_id = ?`,
      [aid, eid],
    );
    if (!at.length)
      return res.status(404).json({ success: false, message: "作答不存在" });
    const m = mergeAttemptScores(at[0]);
    const per = parseJson(m.per_question_scores) || {};
    const keys =
      keysFilter && keysFilter.length ? keysFilter : Object.keys(per);
    for (const k of keys) {
      const p = per[k];
      if (
        !p ||
        p.ai_suggested_score == null ||
        !Number.isFinite(Number(p.ai_suggested_score))
      )
        continue;
      if (p.earned != null && Number.isFinite(Number(p.earned)) && !p.pending)
        continue;
      per[k] = {
        ...p,
        earned: Number(p.ai_suggested_score),
        pending: false,
        auto: false,
      };
    }
    const obj = Number(m.objective_score) || 0;
    let subj = 0;
    for (const p of Object.values(per)) {
      if (
        p &&
        p.auto === false &&
        p.earned != null &&
        Number.isFinite(Number(p.earned))
      ) {
        subj += Number(p.earned);
      }
    }
    const total = obj + subj;
    const hasPending = Object.values(per).some(
      (p) =>
        p &&
        p.auto === false &&
        (p.earned == null || !Number.isFinite(Number(p.earned)) || p.pending),
    );
    const status = hasPending ? "submitted" : "graded";
    await pool.query(
      `UPDATE qb_exam_attempts SET per_question_scores = ?, subjective_score = ?, total_score = ?, status = ?, score_bundle_cipher = NULL WHERE id = ?`,
      [JSON.stringify(per), subj, total, status, aid],
    );
    await recomputeExamRanks(eid);
    await sealExamAttemptIfNeeded(aid);
    try {
      await cache.invalidateQbExam(eid);
    } catch {
      /* ignore */
    }
    res.json({ success: true, data: { status } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "采纳失败" });
  }
}

async function studentRunExamCode(req, res) {
  try {
    const id = toInt(req.params.id);
    const eqId = toInt(req.body?.eq_id);
    const code = req.body?.code;
    if (!eqId)
      return res.status(400).json({ success: false, message: "缺少 eq_id" });
    if (code == null || String(code).length > 100000) {
      return res.status(400).json({ success: false, message: "代码过长" });
    }
    const exam = await getPublishedExamForStudent(id, req.user.id);
    if (!exam)
      return res.status(404).json({ success: false, message: "考试不存在" });
    const [at] = await pool.query(
      `SELECT id, submitted_at FROM qb_exam_attempts WHERE exam_id = ? AND student_id = ?`,
      [id, req.user.id],
    );
    if (!at.length || at[0].submitted_at) {
      return res
        .status(400)
        .json({ success: false, message: "仅作答过程中可试运行代码" });
    }
    const [qrow] = await pool.query(
      `SELECT q.type FROM qb_exam_questions eq JOIN qb_questions q ON q.id = eq.question_id AND q.deleted_at IS NULL WHERE eq.id = ? AND eq.exam_id = ?`,
      [eqId, id],
    );
    if (!qrow.length || qrow[0].type !== "code") {
      return res
        .status(400)
        .json({ success: false, message: "该题不是编程题或未加入本场考试" });
    }
    const result = await runStudentPython(String(code));
    res.json({ success: true, data: result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "运行失败" });
  }
}

async function exportExamScores(req, res) {
  try {
    const id = toInt(req.params.id);
    const [ex] = await pool.query(
      `SELECT title, publish_scores_at FROM qb_exams WHERE id = ? AND teacher_id = ?`,
      [id, req.user.id],
    );
    if (!ex.length)
      return res.status(404).json({ success: false, message: "不存在" });
    const [rows] = await pool.query(
      `SELECT a.*, u.real_name, u.username, u.student_no FROM qb_exam_attempts a
       JOIN users u ON u.id = a.student_id WHERE a.exam_id = ? AND a.submitted_at IS NOT NULL ORDER BY (a.rank_in_class IS NULL) ASC, a.rank_in_class ASC, a.total_score DESC`,
      [id],
    );
    const pubAt = ex[0].publish_scores_at;
    for (const r of rows) {
      await persistUnsealExamAttemptIfReady(r.id, pubAt);
    }
    const [rows2] = await pool.query(
      `SELECT a.*, u.real_name, u.username, u.student_no FROM qb_exam_attempts a
       JOIN users u ON u.id = a.student_id WHERE a.exam_id = ? AND a.submitted_at IS NOT NULL ORDER BY (a.rank_in_class IS NULL) ASC, a.rank_in_class ASC, a.total_score DESC`,
      [id],
    );
    const mergedRows = rows2.map((r) => mergeAttemptScores(r));
    const scores = mergedRows
      .map((r) => Number(r.total_score))
      .filter((x) => Number.isFinite(x));
    const stats = {
      n: scores.length,
      avg: scores.length
        ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)
        : "0",
      max: scores.length ? Math.max(...scores) : 0,
      min: scores.length ? Math.min(...scores) : 0,
    };
    const buf = buildScoresExportBuffer({
      title: ex[0].title,
      rows: mergedRows,
      stats,
    });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="exam-${id}-scores.xlsx"`,
    );
    res.send(buf);
  } catch (e) {
    res.status(500).json({ success: false, message: "导出失败" });
  }
}

const QB_RANDOM_TYPES = ["single", "multi", "judge", "fill", "short", "code"];

function mergeExamRandomRules(stored, bodyRules) {
  const a =
    stored && typeof stored === "object" ? stored : parseJson(stored) || {};
  const b = bodyRules && typeof bodyRules === "object" ? bodyRules : {};
  return { ...a, ...b };
}

function normalizeExamRandomRules(rules) {
  const r = rules && typeof rules === "object" ? rules : {};
  const src = r.counts_by_type || r.countsByType || {};
  const countsByType = {};
  for (const t of QB_RANDOM_TYPES) {
    countsByType[t] = Math.min(100, Math.max(0, toInt(src[t]) || 0));
  }
  const perTypeSum = QB_RANDOM_TYPES.reduce((s, t) => s + countsByType[t], 0);
  const hasPerType = perTypeSum > 0;
  const count = Math.min(200, Math.max(1, toInt(r.count) || 10));
  const types =
    Array.isArray(r.types) && r.types.length
      ? r.types.filter((t) => QB_RANDOM_TYPES.includes(t))
      : null;
  const difficulty =
    r.difficulty && ["easy", "medium", "hard"].includes(r.difficulty)
      ? r.difficulty
      : null;
  const knowledge_tag = r.knowledge_tag ? String(r.knowledge_tag).trim() : "";
  return { countsByType, hasPerType, count, types, difficulty, knowledge_tag };
}

function difficultyTagSqlFragment(difficulty, knowledgeTag) {
  let frag = "";
  const extra = [];
  if (difficulty) {
    frag += " AND q.difficulty = ?";
    extra.push(difficulty);
  }
  if (knowledgeTag) {
    frag +=
      " AND (CAST(q.knowledge_tags AS CHAR) LIKE ? OR IFNULL(q.course_label,'') LIKE ?)";
    const like = `%${knowledgeTag}%`;
    extra.push(like, like);
  }
  return { frag, extra };
}

async function pickRandomQuestionIds(conn, teacherId, norm) {
  const { frag, extra } = difficultyTagSqlFragment(
    norm.difficulty,
    norm.knowledge_tag,
  );
  const ids = [];
  const seen = new Set();
  if (norm.hasPerType) {
    for (const t of QB_RANDOM_TYPES) {
      const n = norm.countsByType[t];
      if (!n) continue;
      const sql = `SELECT q.id FROM qb_questions q WHERE q.teacher_id = ? AND q.deleted_at IS NULL AND q.type = ?${frag} ORDER BY RAND() LIMIT ?`;
      const params = [teacherId, t, ...extra, n];
      const [qs] = await conn.query(sql, params);
      for (const row of qs) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          ids.push(row.id);
          if (ids.length >= 200) return ids;
        }
      }
    }
    return ids;
  }
  let where = "WHERE q.teacher_id = ? AND q.deleted_at IS NULL";
  const params = [teacherId];
  if (norm.types && norm.types.length) {
    where += ` AND q.type IN (${norm.types.map(() => "?").join(",")})`;
    params.push(...norm.types);
  }
  const pick = Math.min(200, norm.count);
  const [qs] = await conn.query(
    `SELECT q.id FROM qb_questions q ${where}${frag} ORDER BY RAND() LIMIT ?`,
    [...params, ...extra, pick],
  );
  return qs.map((row) => row.id);
}

async function validateAndOrderQuestionIds(conn, teacherId, rawIds) {
  const uniq = [
    ...new Set((rawIds || []).map((x) => toInt(x)).filter((x) => x > 0)),
  ].slice(0, 200);
  if (!uniq.length) return [];
  const [ok] = await conn.query(
    `SELECT id FROM qb_questions WHERE teacher_id = ? AND deleted_at IS NULL AND id IN (${uniq.map(() => "?").join(",")})`,
    [teacherId, ...uniq],
  );
  const allowed = new Set(ok.map((r) => r.id));
  return uniq.filter((id) => allowed.has(id));
}

async function replaceExamQuestionsFromIds(conn, examId, questionIds) {
  await conn.query(`DELETE FROM qb_exam_questions WHERE exam_id = ?`, [examId]);
  await conn.query(
    `DELETE FROM qb_question_usage WHERE ref_type = 'exam' AND ref_id = ?`,
    [examId],
  );
  let order = 0;
  for (const qid of questionIds) {
    await conn.query(
      `INSERT INTO qb_exam_questions (exam_id, question_id, sort_order, score) VALUES (?, ?, ?, (SELECT default_score FROM qb_questions WHERE id = ?))`,
      [examId, qid, order, qid],
    );
    await recordUsage(conn, qid, "exam", examId);
    order += 1;
  }
  return order;
}

async function previewRandomExamQuestions(req, res) {
  const conn = await pool.getConnection();
  try {
    const id = toInt(req.params.id);
    const [ex] = await conn.query(
      `SELECT id, teacher_id, random_pick_rules FROM qb_exams WHERE id = ? AND teacher_id = ?`,
      [id, req.user.id],
    );
    if (!ex.length)
      return res.status(404).json({ success: false, message: "不存在" });
    const merged = mergeExamRandomRules(
      parseJson(ex[0].random_pick_rules),
      req.body?.rules,
    );
    const norm = normalizeExamRandomRules(merged);
    const ids = await pickRandomQuestionIds(conn, req.user.id, norm);
    if (!ids.length) {
      return res.json({
        success: true,
        data: { questions: [], question_ids: [], rules: merged },
      });
    }
    const [rows] = await conn.query(
      `SELECT q.id, q.type, q.stem, q.default_score, q.difficulty FROM qb_questions q
       WHERE q.teacher_id = ? AND q.deleted_at IS NULL AND q.id IN (${ids.map(() => "?").join(",")})`,
      [req.user.id, ...ids],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const questions = ids.map((qid) => byId.get(qid)).filter(Boolean);
    res.json({
      success: true,
      data: {
        questions,
        question_ids: ids,
        total: questions.length,
        rules: merged,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "预览失败" });
  } finally {
    conn.release();
  }
}

async function randomPickExamQuestions(req, res) {
  const conn = await pool.getConnection();
  try {
    const id = toInt(req.params.id);
    const [ex] = await conn.query(
      `SELECT id, teacher_id, random_pick_rules FROM qb_exams WHERE id = ? AND teacher_id = ?`,
      [id, req.user.id],
    );
    if (!ex.length)
      return res.status(404).json({ success: false, message: "不存在" });

    let questionIds = [];
    if (Array.isArray(req.body?.question_ids) && req.body.question_ids.length) {
      questionIds = await validateAndOrderQuestionIds(
        conn,
        req.user.id,
        req.body.question_ids,
      );
      if (!questionIds.length) {
        return res
          .status(400)
          .json({ success: false, message: "题目 ID 无效或不属于您的题库" });
      }
    } else {
      const merged = mergeExamRandomRules(
        parseJson(ex[0].random_pick_rules),
        req.body?.rules,
      );
      const norm = normalizeExamRandomRules(merged);
      questionIds = await pickRandomQuestionIds(conn, req.user.id, norm);
      if (!questionIds.length) {
        return res
          .status(400)
          .json({
            success: false,
            message: "题库中无匹配题目，请放宽条件或先录入题目",
          });
      }
    }

    await conn.beginTransaction();
    const order = await replaceExamQuestionsFromIds(conn, id, questionIds);
    const rulesPersist = mergeExamRandomRules(
      parseJson(ex[0].random_pick_rules),
      req.body?.rules || {},
    );
    const rulesJson = JSON.stringify({
      ...rulesPersist,
      counts_by_type: normalizeExamRandomRules(rulesPersist).countsByType,
      last_pick_count: order,
    });
    await conn.query(
      `UPDATE qb_exams SET randomize = 1, random_pick_rules = ? WHERE id = ?`,
      [rulesJson, id],
    );
    await conn.commit();
    await cache.invalidateQbExam(id);
    res.json({ success: true, count: order });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ success: false, message: "随机组卷失败" });
  } finally {
    conn.release();
  }
}

module.exports = {
  listTeacherExams,
  createExam,
  updateExam,
  deleteExam,
  getExamTeacher,
  setExamQuestions,
  randomPickExamQuestions,
  previewRandomExamQuestions,
  listStudentExams,
  studentExamMeta,
  startExam,
  autosaveExam,
  tabEventExam,
  submitExam,
  studentExamResult,
  listExamAttempts,
  gradeExamAttempt,
  adoptExamAiScores,
  studentRunExamCode,
  exportExamScores,
};
