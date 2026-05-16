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
  enterpriseCanAccessTask,
  enterpriseOwnsSubmissionTask,
} = require("../utils/accessControl");
const { computeTaskSimilarityForSubmission } = require("../utils/similarity");

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
) {
  const extracted = filePath
    ? await extractTextFromFile(filePath, fileType, fileName)
    : "";
  const base = (textContent || "").trim();
  if (extracted && base) {
    return `${base}\n\n${ATTACHMENT_PARSE_MARKER}\n${extracted}`;
  }
  if (extracted) {
    return `\n\n${ATTACHMENT_PARSE_MARKER}\n${extracted}`;
  }
  return base;
}

const submitAssignment = async (req, res) => {
  try {
    const { taskId, content } = req.body;
    const studentId = req.user.id;

    if (taskId === undefined || taskId === null || String(taskId).trim() === "") {
      return res
        .status(400)
        .json({
          success: false,
          message: "缺少任务 ID（taskId），请确认表单以 multipart 正确提交",
        });
    }

    const ok = await studentCanAccessTask(studentId, taskId);
    if (!ok) {
      return res.status(403).json({ success: false, message: "无权向该任务提交作业" });
    }

    const [deadRows] = await pool.query(`SELECT deadline, max_submissions FROM tasks WHERE id = ?`, [taskId]);
    if (!deadRows.length) {
      return res.status(404).json({ success: false, message: "任务不存在" });
    }
    const maxSubmissions = normalizeMaxSubmissions(deadRows[0].max_submissions);
    if (deadRows[0].deadline) {
      const dl = new Date(deadRows[0].deadline);
      if (!Number.isNaN(dl.getTime()) && Date.now() > dl.getTime()) {
        return res.status(403).json({
          success: false,
          message: "已超过提交截止时间，无法提交或修改作业",
        });
      }
    }

    let filePath = null;
    let fileName = null;
    let fileType = null;
    let archiveExtractedText = null;
    let archiveExtractedFileCount = null;

    if (req.file) {
      filePath = req.file.path;
      fileName = decodeMultipartFilename(req.file.originalname);
      fileType = req.file.mimetype;
    }

    let mergedContent;
    if (req.file && isZipSubmission(fileName, fileType)) {
      let zr;
      try {
        zr = await extractSafeZipArchive(filePath, fileName);
      } catch (e) {
        console.error("zip extract error:", e.message);
        zr = {
          ok: false,
          message: "压缩包处理异常，请稍后重试或改为上传单个文件",
        };
      }
      if (!zr.ok) {
        try {
          if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}
        return res.status(400).json({ success: false, message: zr.message });
      }
      archiveExtractedText =
        zr.text && String(zr.text).trim() ? String(zr.text).trim() : null;
      archiveExtractedFileCount = Number.isFinite(zr.fileCount) ? zr.fileCount : 0;
      const base = (content || "").trim();
      const zipNote =
        archiveExtractedFileCount > 0
          ? `（已上传源码压缩包 .zip，系统已解析 ${archiveExtractedFileCount} 个文本类文件供 AI 批改）`
          : `（已上传压缩包，未解析到允许的文本类文件；请将源码保存为允许的后缀或补充文字说明）`;
      mergedContent = base
        ? `${base}\n\n${ATTACHMENT_PARSE_MARKER}\n${zipNote}`
        : `${ATTACHMENT_PARSE_MARKER}\n${zipNote}`;
    } else {
      mergedContent = await mergeExtractedContent(filePath, fileType, fileName, content);
    }

    const [existing] = await pool.query(
      "SELECT id, revised_count, file_path FROM submissions WHERE task_id = ? AND student_id = ?",
      [taskId, studentId],
    );

    if (existing.length > 0) {
      const usedCount = Number(existing[0].revised_count) + 1;
      if (usedCount >= maxSubmissions) {
        return res.status(403).json({
          success: false,
          message: "已达到最大提交次数，无法再次提交",
        });
      }
      if (existing[0].file_path) {
        try {
          if (fs.existsSync(existing[0].file_path)) {
            fs.unlinkSync(existing[0].file_path);
          }
        } catch (e) {}
      }

      await pool.query(
        "UPDATE submissions SET file_path = ?, file_name = ?, file_type = ?, content = ?, archive_extracted_text = ?, archive_extracted_file_count = ?, is_revised = 1, revised_count = revised_count + 1, submitted_at = NOW() WHERE id = ?",
        [
          filePath,
          fileName,
          fileType,
          mergedContent,
          archiveExtractedText,
          archiveExtractedFileCount,
          existing[0].id,
        ],
      );

      await refreshSimilarityForTask(pool, taskId, existing[0].id);

      try {
        const [trow] = await pool.query(
          "SELECT class_id, created_by FROM tasks WHERE id = ? LIMIT 1",
          [taskId]
        );
        if (trow.length) {
          await cache.invalidateAfterSubmission(taskId, trow[0].class_id, trow[0].created_by);
        }
      } catch {
        /* ignore cache */
      }
      const body = { success: true, message: "作业已修改提交" };
      if (archiveExtractedFileCount != null) {
        body.archiveExtractedFileCount = archiveExtractedFileCount;
      }
      res.json(body);
      void pushSubmissionRt(taskId, studentId, existing[0].id, "revised", body);
    } else {
      const [result] = await pool.query(
        "INSERT INTO submissions (task_id, student_id, file_path, file_name, file_type, content, archive_extracted_text, archive_extracted_file_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          taskId,
          studentId,
          filePath,
          fileName,
          fileType,
          mergedContent,
          archiveExtractedText,
          archiveExtractedFileCount,
        ],
      );

      await refreshSimilarityForTask(pool, taskId, result.insertId);

      try {
        const [trow] = await pool.query(
          "SELECT class_id, created_by FROM tasks WHERE id = ? LIMIT 1",
          [taskId]
        );
        if (trow.length) {
          await cache.invalidateAfterSubmission(taskId, trow[0].class_id, trow[0].created_by);
        }
      } catch {
        /* ignore cache */
      }
      const created = {
        success: true,
        message: "作业提交成功",
        submissionId: result.insertId,
      };
      if (archiveExtractedFileCount != null) {
        created.archiveExtractedFileCount = archiveExtractedFileCount;
      }
      res.status(201).json(created);
      void pushSubmissionRt(taskId, studentId, result.insertId, "created", created);
    }
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "提交失败", error: error.message });
  }
};

const getSubmissionsByTask = async (req, res) => {
  try {
    const taskId = req.params.taskId;

    if (req.user.role === "teacher") {
      const task = await teacherOwnsTaskForGrading(req.user.id, taskId);
      if (!task) {
        return res.status(404).json({ success: false, message: "任务不存在或无权查看" });
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
             u.real_name as student_name, u.class_id,
             c.class_name, gr.total_score, gr.final_score, gr.human_score, gr.status
      FROM submissions s
      LEFT JOIN users u ON s.student_id = u.id
      LEFT JOIN classes c ON u.class_id = c.id
      LEFT JOIN grading_results gr ON s.id = gr.submission_id
      WHERE s.task_id = ?
      ORDER BY s.submitted_at DESC
    `,
      [taskId],
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

const getSubmissionById = async (req, res) => {
  try {
    const [submissions] = await pool.query(
      `
      SELECT s.id, s.task_id, s.student_id, s.file_path, s.file_name, s.file_type, 
             s.content, s.archive_extracted_file_count, s.submitted_at, s.is_revised, s.revised_count,
             s.max_similarity, s.similarity_level, s.similarity_pairs,
             u.real_name as student_name,
             t.max_submissions AS task_max_submissions
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

    const data = mapSubmissionFileName({ ...row });
    const tmax = normalizeMaxSubmissions(data.task_max_submissions);
    data.task_max_submissions = tmax;
    data.submit_used_count = Number(data.revised_count) + 1;

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

module.exports = {
  submitAssignment,
  getSubmissionsByTask,
  getSubmissionById,
  getSimilarityCompare,
  getStudentSubmissions,
  deleteSubmission,
};
