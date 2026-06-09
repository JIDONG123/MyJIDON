/**
 * 学生提交 handler（多附件 + 正文/代码区）
 */
const fs = require('fs');
const pool = require('../config/database');
const cache = require('../utils/cacheService');
const { decodeMultipartFilename } = require('../utils/filenameEncoding');
const { studentCanAccessTask } = require('../utils/accessControl');
const { computeTaskSimilarityForSubmission } = require('../utils/similarity');
const { evaluateSubmissionUpload } = require('./contentSafetyService');
const { enqueueSubmissionCodeRun, linkPreSubmitCodeRunToSubmission } = require('./codeRunSubmissionService');
const {
  validateSubmitInput,
  processAllFiles,
  buildAttachmentParseBlocks,
  buildMergedContent,
  computeSubmissionCodeHash,
  assertCodeRunBeforeSubmit,
  insertAttachments,
  deleteBySubmissionId,
} = require('./submissionSubmitService');
const {
  evaluateResubmitSlot,
  archiveSubmissionSnapshot,
  resetGradingForResubmit,
  consumeResubmitPermission,
  loadActiveResubmitPermission,
} = require('./submissionResubmitService');

function normalizeMaxSubmissions(raw) {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 9999);
}

async function refreshSimilarityForTask(poolConn, taskId, submissionId) {
  try {
    const [cfg] = await poolConn.query(
      `SELECT config_key, config_value FROM system_config WHERE config_key IN ('similarity_warn_threshold','similarity_suspect_threshold')`
    );
    const map = Object.fromEntries(cfg.map((r) => [r.config_key, Number(r.config_value)]));
    const warn = Number.isFinite(map.similarity_warn_threshold) ? map.similarity_warn_threshold : 40;
    const suspect = Number.isFinite(map.similarity_suspect_threshold) ? map.similarity_suspect_threshold : 70;
    const [all] = await poolConn.query(
      'SELECT id, content, archive_extracted_text, file_name FROM submissions WHERE task_id = ?',
      [taskId]
    );
    const merged = all.map((row) => ({
      ...row,
      content: (row.archive_extracted_text && String(row.archive_extracted_text).trim()) || row.content || '',
    }));
    const current = merged.find((x) => Number(x.id) === Number(submissionId));
    if (!current) return;
    const { maxSimilarity, similarity_level, pairs } = computeTaskSimilarityForSubmission(
      current,
      merged,
      warn,
      suspect
    );
    await poolConn.query(
      'UPDATE submissions SET max_similarity = ?, similarity_level = ?, similarity_pairs = ? WHERE id = ?',
      [maxSimilarity, similarity_level, JSON.stringify(pairs), submissionId]
    );
  } catch (e) {
    console.error('similarity update skipped:', e.message);
  }
}

async function handleSubmitAssignment(req, res, { pushSubmissionRt }) {
  const { taskId } = req.body;
  const submissionText = String(req.body.submissionText ?? req.body.content ?? '').trim();
  const codeContent = String(req.body.codeContent ?? req.body.code_content ?? '').trim();
  const codeLanguage = String(req.body.codeLanguage ?? req.body.code_language ?? '').trim().toLowerCase();
  const codeRunBoundHash = String(req.body.codeRunBoundHash ?? req.body.code_run_bound_hash ?? '').trim() || null;
  const studentId = req.user.id;
  const uploadFiles = req.uploadFiles || [];

  if (taskId === undefined || taskId === null || String(taskId).trim() === '') {
    return res.status(400).json({ success: false, message: '缺少任务 ID（taskId）' });
  }

  const inputCheck = await validateSubmitInput({ submissionText, codeContent, files: uploadFiles });
  if (!inputCheck.ok) {
    for (const f of uploadFiles) {
      try {
        if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
      } catch (_) {}
    }
    return res.status(400).json({ success: false, message: inputCheck.message });
  }

  const textSafety = await evaluateSubmissionUpload({ content: submissionText, user: req.user });
  if (textSafety.blocked) {
    for (const f of uploadFiles) {
      try {
        if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
      } catch (_) {}
    }
    return res.status(400).json({ success: false, message: textSafety.message || '文字说明未通过内容安全检测' });
  }

  const ok = await studentCanAccessTask(studentId, taskId);
  if (!ok) return res.status(403).json({ success: false, message: '无权向该任务提交作业' });

  const [deadRows] = await pool.query(
    'SELECT deadline, max_submissions, code_run_language FROM tasks WHERE id = ?',
    [taskId]
  );
  if (!deadRows.length) return res.status(404).json({ success: false, message: '任务不存在' });

  const maxSubmissions = normalizeMaxSubmissions(deadRows[0].max_submissions);

  const [existingEarly] = await pool.query(
    'SELECT id FROM submissions WHERE task_id = ? AND student_id = ?',
    [taskId, studentId]
  );
  const resubmitPermEarly = await loadActiveResubmitPermission({
    taskId,
    studentId,
    submissionId: existingEarly[0]?.id ?? null,
  });

  if (deadRows[0].deadline && !resubmitPermEarly) {
    const dl = new Date(deadRows[0].deadline);
    if (!Number.isNaN(dl.getTime()) && Date.now() > dl.getTime()) {
      return res.status(403).json({ success: false, message: '已超过提交截止时间，无法提交或修改作业' });
    }
  }

  const [taskCtxRows] = await pool.query('SELECT class_id FROM tasks WHERE id = ? LIMIT 1', [taskId]);
  const progressMeta = {
    taskId: Number(taskId),
    studentId: Number(studentId),
    classId: taskCtxRows[0]?.class_id,
  };

  let processedFiles = [];
  let overallSafety = textSafety.safetyStatus || 'passed';
  let safetyReason = textSafety.safetyReason || null;
  let archiveExtractedText = null;
  let archiveExtractedFileCount = null;

  if (uploadFiles.length) {
    try {
      const pf = await processAllFiles(uploadFiles, { user: req.user, progressMeta });
      processedFiles = pf.processed;
      if (pf.overallSafety === 'pending_review') {
        overallSafety = 'pending_review';
        safetyReason = pf.safetyReason;
      }
      archiveExtractedText = pf.archiveExtractedText;
      archiveExtractedFileCount = pf.archiveExtractedFileCount;
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message || '附件处理失败' });
    }
  }

  const attachmentHashes = processedFiles.map((p) => p.fileHash).filter(Boolean);
  const codeHash = computeSubmissionCodeHash({
    codeContent,
    codeLanguage: codeLanguage || deadRows[0].code_run_language,
    attachmentHashes,
  });

  const codeRunGate = await assertCodeRunBeforeSubmit({
    taskId,
    studentId,
    submissionText,
    codeContent,
    codeLanguage: codeLanguage || deadRows[0].code_run_language,
    attachmentHashes,
    codeRunBoundHash,
  });
  if (!codeRunGate.ok) {
    for (const f of uploadFiles) {
      try {
        if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
      } catch (_) {}
    }
    return res.status(codeRunGate.status || 400).json({ success: false, message: codeRunGate.message });
  }

  const mergedContent = buildMergedContent({
    submissionText,
    codeContent,
    attachmentParseBlocks: buildAttachmentParseBlocks(processedFiles),
    vlBlocks: [],
  });

  const first = processedFiles[0];
  const filePath = first?.filePath || null;
  const fileName = first?.originalName || null;
  const fileType = first?.mimeType || null;
  const fileHash = first?.fileHash || null;

  const [existing] = await pool.query(
    'SELECT id, revised_count, file_path, resubmit_status FROM submissions WHERE task_id = ? AND student_id = ?',
    [taskId, studentId]
  );

  const persist = async (submissionId, isUpdate) => {
    if (isUpdate) await deleteBySubmissionId(submissionId);
    if (processedFiles.length) await insertAttachments(submissionId, processedFiles);
    await refreshSimilarityForTask(pool, taskId, submissionId);
    try {
      const [trow] = await pool.query('SELECT class_id, created_by FROM tasks WHERE id = ? LIMIT 1', [taskId]);
      if (trow.length) await cache.invalidateAfterSubmission(taskId, trow[0].class_id, trow[0].created_by);
    } catch (_) {}

    const boundHash = codeRunGate.codeHash || codeRunBoundHash;
    if (boundHash) {
      const linked = await linkPreSubmitCodeRunToSubmission(submissionId, {
        taskId: Number(taskId),
        studentId,
        codeHash: boundHash,
      });
      if (!linked.linked) {
        void enqueueSubmissionCodeRun(submissionId);
      }
    } else {
      void enqueueSubmissionCodeRun(submissionId);
    }
  };

  if (existing.length > 0) {
    const usedCount = Number(existing[0].revised_count) + 1;
    const slot = await evaluateResubmitSlot({
      taskId,
      studentId,
      submissionId: existing[0].id,
      usedCount,
      maxSubmissions,
    });
    if (!slot.ok) {
      return res.status(403).json({ success: false, message: slot.reason || '已达到最大提交次数，无法再次提交' });
    }

    const resubmitPerm = slot.permission || null;
    const isReturnResubmit = Boolean(resubmitPerm) || existing[0].resubmit_status === 'returned';

    if (isReturnResubmit) {
      await archiveSubmissionSnapshot(existing[0].id, 'teacher_return_resubmit');
      await resetGradingForResubmit(existing[0].id);
    }

    if (existing[0].file_path && existing[0].file_path !== filePath) {
      try {
        if (fs.existsSync(existing[0].file_path)) fs.unlinkSync(existing[0].file_path);
      } catch (_) {}
    }
    await pool.query(
      `UPDATE submissions SET
        file_path = ?, file_name = ?, file_type = ?, content = ?, submission_text = ?,
        code_content = ?, code_language = ?, code_content_hash = ?, code_run_bound_hash = ?,
        archive_extracted_text = ?, archive_extracted_file_count = ?,
        is_revised = 1, revised_count = revised_count + 1, submitted_at = NOW(),
        resubmit_status = 'normal',
        safety_status = ?, safety_reason = ?, safety_checked_at = NOW(), file_hash = ?
       WHERE id = ?`,
      [
        filePath, fileName, fileType, mergedContent, submissionText,
        codeContent || null, codeLanguage || null, codeHash,
        codeRunGate.codeHash || codeRunBoundHash,
        archiveExtractedText, archiveExtractedFileCount,
        overallSafety, safetyReason, fileHash, existing[0].id,
      ]
    );
    await persist(existing[0].id, true);
    if (resubmitPerm) {
      await consumeResubmitPermission(resubmitPerm.id);
    }
    const body = {
      success: true,
      message: isReturnResubmit ? '作业已重新提交，等待重新批改' : '作业已修改提交',
      submissionId: existing[0].id,
      resubmitted: isReturnResubmit,
    };
    res.json(body);
    void pushSubmissionRt(taskId, studentId, existing[0].id, 'revised', body);
  } else {
    const [result] = await pool.query(
      `INSERT INTO submissions
        (task_id, student_id, file_path, file_name, file_type, content, submission_text,
         code_content, code_language, code_content_hash, code_run_bound_hash,
         archive_extracted_text, archive_extracted_file_count,
         safety_status, safety_reason, safety_checked_at, file_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [
        taskId, studentId, filePath, fileName, fileType, mergedContent, submissionText,
        codeContent || null, codeLanguage || null, codeHash,
        codeRunGate.codeHash || codeRunBoundHash,
        archiveExtractedText, archiveExtractedFileCount,
        overallSafety, safetyReason, fileHash,
      ]
    );
    await persist(result.insertId, false);
    const created = { success: true, message: '作业提交成功', submissionId: result.insertId };
    res.status(201).json(created);
    void pushSubmissionRt(taskId, studentId, result.insertId, 'created', created);
  }
}

module.exports = { handleSubmitAssignment, normalizeMaxSubmissions };
