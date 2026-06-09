const pool = require("../config/database");
const cache = require("../utils/cacheService");
const fs = require("fs");
const path = require("path");
const { extractTextFromFile } = require("../services/fileParser");
const { isZipSubmission, extractSafeZipArchive } = require("../services/safeZipArchive");
const {
  decodeMultipartFilename,
  mapSubmissionFileName,
} = require("../utils/filenameEncoding");
const {
  studentCanAccessTask,
  teacherOwnsTaskForGrading,
  teacherOwnsSubmissionTask,
  teacherTaskVisibilityWhere,
  teacherTaskVisibilityParams,
  enterpriseCanAccessTask,
  enterpriseOwnsSubmissionTask,
} = require("../utils/accessControl");
const { computeTaskSimilarityForSubmission } = require("../utils/similarity");
const {
  enhanceExtractedTextIfImage,
  appendZipImagesVlRecognition,
  persistVlRecognition,
} = require("../services/vlRecognitionService");
const { enqueueSubmissionCodeRun } = require("../services/codeRunSubmissionService");
const {
  evaluateSubmissionUpload,
} = require("../services/contentSafetyService");
const {
  validateSubmitInput,
  processAllFiles,
  buildAttachmentParseBlocks,
  buildMergedContent,
  computeSubmissionCodeHash,
  assertCodeRunBeforeSubmit,
  insertAttachments,
  deleteBySubmissionId,
} = require("../services/submissionSubmitService");
const { listAttachmentsForSubmission, getAttachmentById } = require("../services/submissionAttachmentService");
const { ensureSubmissionCodeRunLinked } = require("../services/codeRunSubmissionService");
const { studentWrittenDescriptionOnly } = require("../utils/submissionContentBuild");

async function pushSubmissionRt(taskId, studentId, submissionId, phase, extra) {
  try {
    const rt = require("../utils/realtimeEmit");
    const [rows] = await pool.query("SELECT class_id FROM tasks WHERE id = ? LIMIT 1", [taskId]);
    const classId = rows[0]?.class_id;
    if (classId == null) return;
    rt.emitSubmissionsStaff(classId, taskId, studentId, submissionId, phase, extra || {});
    rt.emitSubmissionStudent(studentId, phase, { taskId, submissionId, ...(extra || {}) });
    rt.emitTasksMutate(Number(classId), Number(taskId), "submission_changed");
    rt.emitSimilarity(Number(classId), Number(taskId), { submissionId });
  } catch {
    /* ignore */
  }
}

function normalizeMaxSubmissions(raw) {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 9999);
}

async function refreshSimilarityForTask(pool, taskId, submissionId) {
  try {
    const [cfg] = await pool.query(
      `SELECT config_key, config_value FROM system_config WHERE config_key IN ('similarity_warn_threshold','similarity_suspect_threshold')`
    );
    const map = Object.fromEntries(cfg.map((r) => [r.config_key, Number(r.config_value)]));
    const warn = Number.isFinite(map.similarity_warn_threshold) ? map.similarity_warn_threshold : 40;
    const suspect = Number.isFinite(map.similarity_suspect_threshold) ? map.similarity_suspect_threshold : 70;

    const [all] = await pool.query(
      "SELECT id, content, archive_extracted_text, file_name FROM submissions WHERE task_id = ?",
      [taskId]
    );
    const merged = all.map((row) => ({
      ...row,
      content:
        (row.archive_extracted_text && String(row.archive_extracted_text).trim()) ||
        row.content ||
        "",
    }));
    const current = merged.find((x) => Number(x.id) === Number(submissionId));
    if (!current) return;
    const { maxSimilarity, similarity_level, pairs } = computeTaskSimilarityForSubmission(
      current,
      merged,
      warn,
      suspect
    );
    await pool.query(
      "UPDATE submissions SET max_similarity = ?, similarity_level = ?, similarity_pairs = ? WHERE id = ?",
      [maxSimilarity, similarity_level, JSON.stringify(pairs), submissionId]
    );
  } catch (e) {
    console.error("similarity update skipped:", e.message);
  }
}

/** 与前端展示逻辑一致：库内 content 在标记后的文本仅供 AI/查重，教师端「作业正文」只展示标记前的文字说明 */
const ATTACHMENT_PARSE_MARKER = "---------- 附件解析文本 ----------";

async function mergeExtractedContent(
  filePath,
  fileType,
  fileName,
  textContent,
  progressMeta,
) {
  let extracted = filePath
    ? await extractTextFromFile(filePath, fileType, fileName)
    : "";
  let vlResult = { status: "skipped" };
  if (filePath) {
    const enhanced = await enhanceExtractedTextIfImage(
      filePath,
      fileType,
      fileName,
      extracted,
      progressMeta,
    );
    extracted = enhanced.text;
    vlResult = enhanced.vl || vlResult;
  }
  const base = (textContent || "").trim();
  let merged;
  if (extracted && base) {
    merged = `${base}\n\n${ATTACHMENT_PARSE_MARKER}\n${extracted}`;
  } else if (extracted) {
    merged = `\n\n${ATTACHMENT_PARSE_MARKER}\n${extracted}`;
  } else {
    merged = base;
  }
  return { mergedContent: merged, vlResult };
}

const { handleSubmitAssignment } = require("../services/submissionSubmitHandler");

const submitAssignment = async (req, res) => {
  try {
    await handleSubmitAssignment(req, res, { pushSubmissionRt });
  } catch (error) {
    res.status(500).json({ success: false, message: "提交失败", error: error.message });
  }
};

/** 教师成果批改工作台：汇总本人发布任务下的全部提交 */
const getTeacherGradingWorkbench = async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({ success: false, message: "仅教师可访问" });
    }
    const teacherId = req.user.id;
    const statusFilter = String(req.query.status || "all").toLowerCase();

    let statusClause = "";
    if (statusFilter === "pending") {
      statusClause =
        " AND (gr.status IS NULL OR gr.status IN ('pending', 'ai_graded', 'human_graded'))";
    } else if (statusFilter === "graded") {
      statusClause =
        " AND gr.status IN ('human_reviewed', 'human_graded', 'completed')";
    }

    const params = [...teacherTaskVisibilityParams(teacherId)];
    let extra = "";
    const taskId = req.query.taskId ? Number(req.query.taskId) : null;
    if (taskId) {
      extra += " AND t.id = ?";
      params.push(taskId);
    }
    const teachingClassId = req.query.teachingClassId
      ? Number(req.query.teachingClassId)
      : null;
    if (teachingClassId) {
      extra += " AND t.teaching_class_id = ?";
      params.push(teachingClassId);
    }
    const courseId = req.query.courseId ? Number(req.query.courseId) : null;
    if (courseId) {
      extra += " AND t.course_id = ?";
      params.push(courseId);
    }

    const [rows] = await pool.query(
      `
      SELECT s.id AS submission_id, s.task_id, s.student_id, s.file_name, s.submitted_at,
             s.is_revised, s.max_similarity, s.similarity_level,
             u.real_name AS student_name,
             t.title AS task_title, t.deadline AS task_deadline,
             t.class_id, t.teaching_class_id, t.course_id,
             c.class_name,
             tc.class_name AS teaching_class_name,
             co.course_name,
             tm.name AS term_name,
             gr.total_score, gr.final_score, gr.human_score, gr.status AS grading_status
      FROM submissions s
      INNER JOIN tasks t ON s.task_id = t.id
      INNER JOIN users u ON s.student_id = u.id
      LEFT JOIN classes c ON t.class_id = c.id
      LEFT JOIN teaching_classes tc ON t.teaching_class_id = tc.id
      LEFT JOIN terms tm ON tc.term_id = tm.id
      LEFT JOIN courses co ON t.course_id = co.id
      LEFT JOIN grading_results gr ON gr.submission_id = s.id
      WHERE ${teacherTaskVisibilityWhere("t")}${extra}${statusClause}
      ORDER BY s.submitted_at DESC
      LIMIT 500
    `,
      params
    );

    res.json({
      success: true,
      data: rows.map((r) => {
        const mapped = mapSubmissionFileName({ file_name: r.file_name });
        return {
          ...r,
          file_name: mapped.file_name || r.file_name,
          audience_label: r.teaching_class_name || r.class_name || "—",
        };
      }),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "获取成果批改工作台失败",
      error: error.message,
    });
  }
};

const getSubmissionsByTask = async (req, res) => {
  try {
    const taskId = req.params.taskId;

    if (req.user.role === "teacher") {
      const task = await teacherOwnsTaskForGrading(req.user.id, taskId);
      if (!task) {
        return res.status(403).json({ success: false, message: "无权查看该任务提交" });
      }
    } else if (req.user.role === "enterprise") {
      const task = await enterpriseCanAccessTask(req.user.id, taskId);
      if (!task) {
        return res.status(404).json({ success: false, message: "任务不存在或无权查看" });
      }
    }

    const [submissions] = await pool.query(
      `
      SELECT s.id, s.task_id, s.student_id, s.file_name, s.file_type, s.submitted_at,
             s.is_revised, s.revised_count, s.max_similarity, s.similarity_level, s.similarity_pairs,
             s.code_run_summary, s.safety_status, s.safety_reason,
             u.real_name as student_name, u.username, u.student_no, u.class_id,
             c.class_name, gr.total_score, gr.final_score, gr.human_score, gr.status,
             gr.enterprise_score, gr.enterprise_graded_at,
             (
               SELECT i.status
               FROM grading_job_items i
               INNER JOIN grading_jobs j ON j.id = i.job_id
               WHERE i.submission_id = s.id
                 AND i.status IN ('pending', 'queued', 'running')
                 AND j.status IN ('pending', 'running')
               ORDER BY i.id DESC
               LIMIT 1
             ) AS active_grading_item_status
      FROM submissions s
      LEFT JOIN users u ON s.student_id = u.id
      LEFT JOIN classes c ON u.class_id = c.id
      LEFT JOIN grading_results gr ON s.id = gr.submission_id
      WHERE s.task_id = ?
      ORDER BY s.submitted_at DESC
    `,
      [taskId],
    );
    const [taskMeta] = await pool.query('SELECT code_run_enabled FROM tasks WHERE id = ? LIMIT 1', [taskId]);
    const codeRunEnabled = Boolean(Number(taskMeta[0]?.code_run_enabled));
    const { attachListEligibilityFields } = require('../utils/submissionAiBatchEligibility');
    const { getFeedbackSummaryForSubmissions } = require('../services/submissionResubmitService');

    const submissionIds = submissions.map((r) => Number(r.id)).filter(Boolean);
    const feedbackMap = await getFeedbackSummaryForSubmissions(submissionIds);

    res.json({
      success: true,
      data: submissions.map((row) => {
        const mapped = mapSubmissionFileName(row);
        const fb = feedbackMap.get(Number(mapped.id)) || {};
        return attachListEligibilityFields(
          {
            ...mapped,
            grading_status: mapped.status,
            active_item_status: mapped.active_grading_item_status,
            feedbackStatus: fb.feedbackStatus || null,
            feedbackCount: fb.feedbackCount || 0,
            latestFeedbackId: fb.latestFeedbackId || null,
          },
          codeRunEnabled
        );
      }),
    });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "获取提交列表失败",
        error: error.message,
      });
  }
};

async function enrichSubmissionDetail(row, req) {
  const { studentWrittenDescriptionOnly } = require('../utils/submissionContentBuild');
  if (row.task_code_run_enabled) {
    await ensureSubmissionCodeRunLinked(row.id);
    const [cr] = await pool.query(
      'SELECT code_run_result_id, code_run_summary, code_run_bound_hash FROM submissions WHERE id = ?',
      [row.id]
    );
    if (cr[0]) Object.assign(row, cr[0]);
  }
  const data = mapSubmissionFileName({ ...row });
  data.submission_text =
    row.submission_text != null && String(row.submission_text).trim()
      ? row.submission_text
      : studentWrittenDescriptionOnly(row.content);
  data.code_content = row.code_content || null;
  data.code_language = row.code_language || null;
  data.attachments = await listAttachmentsForSubmission(row);

  if (data.vl_recognition_meta && typeof data.vl_recognition_meta === 'string') {
    try {
      data.vl_recognition_meta = JSON.parse(data.vl_recognition_meta);
    } catch {
      data.vl_recognition_meta = null;
    }
  }
  const tmax = normalizeMaxSubmissions(data.task_max_submissions);
  data.task_max_submissions = tmax;
  data.submit_used_count = Number(data.revised_count) + 1;

  if (data.task_code_run_enabled) {
    const { loadSubmissionCodeRunContext } = require('../utils/codeRunWorkText');
    const { parseTaskCodeRunConfig } = require('../utils/taskCodeRunConfig');
    const ctx = await loadSubmissionCodeRunContext(row.id);
    const cfg = ctx ? parseTaskCodeRunConfig(ctx.code_run_config) : null;
    data.codeRun = {
      enabled: true,
      summary: ctx?.result_summary || ctx?.code_run_summary || row.code_run_summary,
      resultId: ctx?.code_run_result_id || row.code_run_result_id,
      status: ctx?.job_status || (row.code_run_summary === '排队中…' ? 'pending' : null),
      language: ctx?.job_language || ctx?.code_run_language || data.code_language,
      gradeAfterRun: cfg?.gradeAfterRun ?? false,
      runRequired: cfg?.runRequired ?? false,
      codeRunBoundHash: row.code_run_bound_hash || null,
    };
    if (ctx?.code_run_result_id) {
      data.codeRun.result = {
        compileExitCode: ctx.compile_exit_code,
        runExitCode: ctx.run_exit_code,
        compileLog: ctx.compile_log,
        stdout: ctx.stdout,
        stderr: ctx.stderr,
        timedOut: Boolean(ctx.timed_out),
        durationMs: ctx.duration_ms,
        entryFileFound: Boolean(ctx.entry_file_found),
        summary: ctx.result_summary || data.code_run_summary,
      };
    }
  }

  if (req.user.role === 'student') {
    delete data.safety_reason;
  }
  return data;
}

const getMySubmissionByTask = async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const studentId = req.user.id;
    const ok = await studentCanAccessTask(studentId, taskId);
    if (!ok) return res.status(403).json({ success: false, message: '无权查看该任务' });

    const [rows] = await pool.query(
      `
      SELECT s.*, t.title AS task_title, t.deadline AS task_deadline,
             t.max_submissions AS task_max_submissions, t.code_run_enabled AS task_code_run_enabled,
             t.code_run_language, t.code_run_config,
             u.real_name AS student_name,
             gr.total_score, gr.human_score, gr.final_score, gr.status AS grading_status,
             gr.ai_comment, gr.human_comment, gr.enterprise_score, gr.enterprise_comment
      FROM submissions s
      INNER JOIN tasks t ON t.id = s.task_id
      LEFT JOIN users u ON u.id = s.student_id
      LEFT JOIN grading_results gr ON gr.submission_id = s.id
      WHERE s.task_id = ? AND s.student_id = ?
      LIMIT 1
    `,
      [taskId, studentId]
    );
    if (!rows.length) {
      return res.json({ success: true, data: null });
    }
    const data = await enrichSubmissionDetail(rows[0], req);
    data.task_title = rows[0].task_title;
    data.task_deadline = rows[0].task_deadline;
    data.grading = {
      totalScore: rows[0].total_score,
      humanScore: rows[0].human_score,
      finalScore: rows[0].final_score,
      status: rows[0].grading_status,
      aiComment: rows[0].ai_comment,
      humanComment: rows[0].human_comment,
      enterpriseScore: rows[0].enterprise_score,
      enterpriseComment: rows[0].enterprise_comment,
    };
    const dl = rows[0].task_deadline ? new Date(rows[0].task_deadline) : null;
    data.is_late =
      dl && !Number.isNaN(dl.getTime()) && rows[0].submitted_at
        ? new Date(rows[0].submitted_at).getTime() > dl.getTime()
        : false;
    const { loadActiveResubmitPermission } = require('../services/submissionResubmitService');
    const perm = await loadActiveResubmitPermission({
      taskId,
      studentId,
      submissionId: rows[0].id,
    });
    data.resubmit_permission = perm
      ? {
          id: perm.id,
          expireAt: perm.expire_at,
          extraAttempts: perm.extra_attempts,
          usedAttempts: perm.used_attempts,
          reason: perm.reason,
        }
      : null;
    data.resubmit_status = rows[0].resubmit_status || 'normal';
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取提交详情失败', error: error.message });
  }
};

const getSubmissionById = async (req, res) => {
  try {
    const [submissions] = await pool.query(
      `
      SELECT s.id, s.task_id, s.student_id, s.file_path, s.file_name, s.file_type,
             s.content, s.submission_text, s.code_content, s.code_language, s.code_run_bound_hash,
             s.archive_extracted_file_count, s.submitted_at, s.is_revised, s.revised_count,
             s.vl_recognition_status, s.vl_recognition_text, s.vl_recognition_meta,
             s.vl_recognition_error, s.vl_recognition_at,
             s.max_similarity, s.similarity_level, s.similarity_pairs,
             s.code_run_result_id, s.code_run_summary,
             s.safety_status, s.safety_reason, s.safety_checked_at, s.file_hash,
             s.resubmit_status, s.version,
             u.real_name as student_name,
             t.max_submissions AS task_max_submissions,
             t.code_run_enabled AS task_code_run_enabled, t.title AS task_title, t.deadline AS task_deadline
      FROM submissions s
      LEFT JOIN users u ON s.student_id = u.id
      LEFT JOIN tasks t ON s.task_id = t.id
      WHERE s.id = ?
    `,
      [req.params.id],
    );

    if (submissions.length === 0) {
      return res.status(404).json({ success: false, message: "提交不存在" });
    }

    const row = submissions[0];

    if (req.user.role === "student" && row.student_id !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: "无权查看该提交" });
    }

    if (req.user.role === "teacher") {
      const ok = await teacherOwnsSubmissionTask(req.user.id, req.params.id);
      if (!ok) {
        return res.status(403).json({ success: false, message: "无权查看该提交" });
      }
    } else if (req.user.role === "admin") {
      // 管理员可查看任意提交
    } else if (req.user.role === "enterprise") {
      const ok = await enterpriseOwnsSubmissionTask(req.user.id, req.params.id);
      if (!ok) {
        return res.status(403).json({ success: false, message: "无权查看该提交" });
      }
    }

    const data = await enrichSubmissionDetail(row, req);
    const { loadActiveResubmitPermission } = require('../services/submissionResubmitService');
    const perm = await loadActiveResubmitPermission({
      taskId: row.task_id,
      studentId: row.student_id,
      submissionId: row.id,
    });
    data.resubmit_permission = perm
      ? {
          id: perm.id,
          expireAt: perm.expire_at,
          extraAttempts: perm.extra_attempts,
          usedAttempts: perm.used_attempts,
          reason: perm.reason,
        }
      : null;
    data.resubmit_status = row.resubmit_status || 'normal';

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "获取提交信息失败",
        error: error.message,
      });
  }
};

const getStudentSubmissions = async (req, res) => {
  try {
    const [submissions] = await pool.query(
      `
      SELECT s.id, s.task_id, s.file_name, s.submitted_at, s.is_revised, t.title, 
             t.deadline, gr.total_score, gr.human_score, gr.status
      FROM submissions s
      LEFT JOIN tasks t ON s.task_id = t.id
      LEFT JOIN grading_results gr ON s.id = gr.submission_id
      WHERE s.student_id = ?
      ORDER BY s.submitted_at DESC
    `,
      [req.user.id],
    );
    res.json({
      success: true,
      data: submissions.map(mapSubmissionFileName),
    });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "获取提交列表失败",
        error: error.message,
      });
  }
};

function parseJsonField(val) {
  if (val == null) return null;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

/** 教师/管理员：查重对比数据（正文节选） */
const getSimilarityCompare = async (req, res) => {
  try {
    const id = req.params.id;
    if (req.user.role !== "teacher" && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "无权查看" });
    }
    if (req.user.role === "teacher") {
      const ok = await teacherOwnsSubmissionTask(req.user.id, id);
      if (!ok) {
        return res.status(403).json({ success: false, message: "无权查看该提交" });
      }
    }

    const [rows] = await pool.query(
      `
      SELECT s.id, s.task_id, s.student_id, s.content, s.file_name, s.max_similarity, s.similarity_level,
             s.similarity_pairs, u.real_name AS student_name
      FROM submissions s
      LEFT JOIN users u ON u.id = s.student_id
      WHERE s.id = ?
    `,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "提交不存在" });
    }
    const row = rows[0];
    let pairs = parseJsonField(row.similarity_pairs);
    if (!Array.isArray(pairs)) pairs = [];

    const compares = [];
    for (const p of pairs) {
      const oid = p.otherId;
      if (oid == null) continue;
      const [oRows] = await pool.query(
        `
        SELECT s.id, s.content, s.file_name, u.real_name AS student_name
        FROM submissions s
        LEFT JOIN users u ON u.id = s.student_id
        WHERE s.id = ?
      `,
        [oid]
      );
      if (!oRows.length) continue;
      const o = oRows[0];
      compares.push({
        id: o.id,
        student_name: o.student_name,
        file_name: o.file_name,
        ratio: p.ratio,
        snippet: p.snippet || "",
        contentPreview: String(o.content || "").slice(0, 15000),
      });
    }

    res.json({
      success: true,
      data: {
        current: {
          id: row.id,
          student_name: row.student_name,
          file_name: row.file_name,
          contentPreview: String(row.content || "").slice(0, 15000),
          max_similarity: row.max_similarity,
          similarity_level: row.similarity_level,
        },
        compares,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "获取对比数据失败", error: error.message });
  }
};

const downloadAttachment = async (req, res) => {
  try {
    const submissionId = req.params.id;
    const attachmentId = req.params.attachmentId;

    const [submissions] = await pool.query(
      'SELECT id, student_id, file_path, file_name, file_type FROM submissions WHERE id = ?',
      [submissionId]
    );
    if (!submissions.length) {
      return res.status(404).json({ success: false, message: '提交不存在' });
    }
    const sub = submissions[0];

    if (req.user.role === 'student' && Number(sub.student_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: '无权下载该附件' });
    }
    if (req.user.role === 'teacher') {
      const ok = await teacherOwnsSubmissionTask(req.user.id, submissionId);
      if (!ok) return res.status(403).json({ success: false, message: '无权下载该附件' });
    } else if (req.user.role === 'enterprise') {
      const ok = await enterpriseOwnsSubmissionTask(req.user.id, submissionId);
      if (!ok) return res.status(403).json({ success: false, message: '无权下载该附件' });
    }

    let filePath = null;
    let fileName = null;
    let mimeType = null;

    if (attachmentId === 'legacy' || attachmentId === '0') {
      filePath = sub.file_path;
      fileName = sub.file_name;
      mimeType = sub.file_type;
    } else {
      const att = await getAttachmentById(attachmentId);
      if (!att || Number(att.submission_id) !== Number(submissionId)) {
        return res.status(404).json({ success: false, message: '附件不存在' });
      }
      filePath = att.file_path;
      fileName = att.original_name;
      mimeType = att.mime_type;
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: '文件不存在' });
    }

    if (mimeType) res.setHeader('Content-Type', mimeType);
    res.download(filePath, fileName || path.basename(filePath));
  } catch (error) {
    res.status(500).json({ success: false, message: '下载失败', error: error.message });
  }
};

const deleteSubmission = async (req, res) => {
  try {
    const [meta] = await pool.query(
      "SELECT s.task_id, s.student_id, t.class_id FROM submissions s JOIN tasks t ON s.task_id = t.id WHERE s.id = ?",
      [req.params.id]
    );

    if (req.user.role === "teacher") {
      const row = await teacherOwnsSubmissionTask(req.user.id, req.params.id);
      if (!row) {
        return res.status(403).json({ success: false, message: "无权删除该提交" });
      }
    }

    const [submissions] = await pool.query(
      "SELECT file_path FROM submissions WHERE id = ?",
      [req.params.id],
    );
    if (submissions.length > 0 && submissions[0].file_path) {
      try {
        if (fs.existsSync(submissions[0].file_path)) {
          fs.unlinkSync(submissions[0].file_path);
        }
      } catch (e) {}
    }

    await pool.query("DELETE FROM submissions WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: "删除成功" });
    if (meta.length) {
      void pushSubmissionRt(meta[0].task_id, meta[0].student_id, req.params.id, "deleted", {});
    }
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "删除失败", error: error.message });
  }
};

const getSubmissionHistory = async (req, res) => {
  try {
    const { listSubmissionHistory } = require('../services/submissionHistoryService');
    const data = await listSubmissionHistory(req.params.id, req.user.id, req.user.role);
    res.json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message || '获取历史版本失败', error: error.message });
  }
};

module.exports = {
  submitAssignment,
  getTeacherGradingWorkbench,
  getSubmissionsByTask,
  getSubmissionById,
  getSubmissionHistory,
  getMySubmissionByTask,
  getSimilarityCompare,
  downloadAttachment,
  getStudentSubmissions,
  deleteSubmission,
};
