/**
 * 学生提交：多附件、正文/代码区、合并 content、代码运行校验
 */
const fs = require('fs');
const pool = require('../config/database');
const { extractTextFromFile } = require('./fileParser');
const { isZipSubmission, extractSafeZipArchive } = require('./safeZipArchive');
const { decodeMultipartFilename } = require('../utils/filenameEncoding');
const {
  evaluateSubmissionUpload,
  detectImageSafety,
  sha256File,
} = require('./contentSafetyService');
const { enhanceExtractedTextIfImage } = require('./vlRecognitionService');
const {
  insertAttachments,
  deleteBySubmissionId,
  updateAttachmentVision,
  updateAttachmentParsedText,
} = require('./submissionAttachmentService');
const {
  buildMergedContent,
  computeSubmissionCodeHash,
  looksLikeCodeInText,
  VL_MARKER,
  ATTACHMENT_PARSE_MARKER,
} = require('../utils/submissionContentBuild');
const { parseTaskCodeRunConfig } = require('../utils/taskCodeRunConfig');
const { isLanguageSupported } = require('../utils/codeRunLanguageSpec');

async function loadTaskCodeRun(taskId) {
  const [rows] = await pool.query(
    'SELECT code_run_enabled, code_run_language, code_run_config FROM tasks WHERE id = ?',
    [taskId]
  );
  return rows[0] || null;
}

async function assertCodeRunBeforeSubmit({ taskId, studentId, submissionText, codeContent, codeLanguage, attachmentHashes, codeRunBoundHash }) {
  const task = await loadTaskCodeRun(taskId);
  if (!task?.code_run_enabled) return { ok: true };

  const cfg = parseTaskCodeRunConfig(task.code_run_config);
  if (!cfg.runRequired) return { ok: true };

  const currentHash = computeSubmissionCodeHash({
    codeContent,
    codeLanguage: codeLanguage || task.code_run_language,
    attachmentHashes,
  });

  if (!codeContent?.trim() && !attachmentHashes.length) {
    if (looksLikeCodeInText(submissionText)) {
      return {
        ok: false,
        status: 400,
        message: '检测到文字说明中可能包含代码，请复制到【代码内容】区域后再运行检查',
      };
    }
  }

  if (!codeRunBoundHash) {
    return {
      ok: false,
      status: 400,
      message: '当前任务要求完成代码运行检查，请先在代码区运行',
    };
  }

  if (codeRunBoundHash !== currentHash) {
    return {
      ok: false,
      status: 400,
      message: '当前代码已修改，请重新运行检查',
    };
  }

  const [jobs] = await pool.query(
    `
    SELECT j.id, j.status, j.code_hash, r.run_exit_code, r.timed_out
    FROM code_run_jobs j
    LEFT JOIN code_run_results r ON r.job_id = j.id
    WHERE j.task_id = ? AND j.student_id = ?
      AND j.scope_type IN ('submission', 'manual')
      AND j.code_hash = ?
    ORDER BY j.id DESC LIMIT 1
  `,
    [taskId, studentId, currentHash]
  );

  const job = jobs[0];
  if (!job || !['completed', 'failed', 'timeout'].includes(job.status)) {
    return {
      ok: false,
      status: 400,
      message: '当前任务要求完成代码运行检查，请先在代码区运行',
    };
  }

  if (cfg.runPolicy === 'run_success_required') {
    if (job.timed_out || job.run_exit_code !== 0) {
      return {
        ok: false,
        status: 400,
        message: '当前任务要求代码运行成功，请修复后重新运行检查',
      };
    }
  }

  return { ok: true, codeHash: currentHash };
}

async function processUploadFile(file, { user, progressMeta }) {
  const originalName = decodeMultipartFilename(file.originalname);
  const safetyEval = await evaluateSubmissionUpload({
    file,
    fileName: originalName,
    fileType: file.mimetype,
    user,
  });
  if (safetyEval.blocked) {
    try {
      if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (_) {}
    throw new Error(safetyEval.message || '内容安全检测未通过');
  }

  let parsedText = '';
  let archiveExtractedText = null;
  let archiveExtractedFileCount = null;
  let vlText = null;
  let visionStatus = 'skipped';

  if (isZipSubmission(originalName, file.mimetype)) {
    const zr = await extractSafeZipArchive(file.path, originalName);
    if (!zr.ok) throw new Error(zr.message);
    archiveExtractedText = zr.text?.trim() || null;
    archiveExtractedFileCount = zr.fileCount;
    parsedText = archiveExtractedText || '';
  } else {
    parsedText = await extractTextFromFile(file.path, file.mimetype, originalName);
    if (/^image\//i.test(file.mimetype || '')) {
      const imgR = await detectImageSafety(file.path, { profile: 'submission' });
      if (imgR.riskLevel === 'blocked') {
        throw new Error(imgR.reason || '图片内容未通过安全检测');
      }
      const enhanced = await enhanceExtractedTextIfImage(
        file.path,
        file.mimetype,
        originalName,
        parsedText,
        progressMeta
      );
      parsedText = enhanced.text || parsedText;
      if (enhanced.vl?.status === 'done') {
        visionStatus = 'done';
        vlText = enhanced.vl.plainText || null;
      } else if (enhanced.vl?.status === 'failed') {
        visionStatus = 'failed';
      } else if (imgR.riskLevel === 'suspicious') {
        visionStatus = 'pending';
      }
    }
  }

  const fileHash = safetyEval.fileHash || sha256File(file.path);
  return {
    originalName,
    storedName: file.filename,
    filePath: file.path,
    fileSize: file.size,
    mimeType: file.mimetype,
    fileHash,
    safetyStatus: safetyEval.safetyStatus || 'passed',
    safetyReason: safetyEval.safetyReason,
    safetyCheckedAt: new Date(),
    visionStatus,
    parsedText,
    vlText,
    archiveExtractedText,
    archiveExtractedFileCount,
  };
}

async function processAllFiles(files, ctx) {
  const processed = [];
  let overallSafety = 'passed';
  let safetyReason = null;
  let archiveExtractedText = null;
  let archiveExtractedFileCount = null;

  for (const file of files) {
    const p = await processUploadFile(file, ctx);
    processed.push(p);
    if (p.safetyStatus === 'pending_review') {
      overallSafety = 'pending_review';
      safetyReason = p.safetyReason;
    }
    if (p.archiveExtractedText) {
      archiveExtractedText = p.archiveExtractedText;
      archiveExtractedFileCount = p.archiveExtractedFileCount;
    }
  }
  return { processed, overallSafety, safetyReason, archiveExtractedText, archiveExtractedFileCount };
}

function buildAttachmentParseBlocks(processed) {
  return processed.map((p) => {
    const head = `【附件：${p.originalName}】`;
    if (p.parsedText?.trim()) return `${head}\n${p.parsedText.trim()}`;
    if (p.vlText) return `${head}\n${VL_MARKER}\n${p.vlText}`;
    return `${head}\n（未能解析文本内容）`;
  });
}

async function validateSubmitInput({ submissionText, codeContent, files }) {
  const hasText = Boolean(String(submissionText || '').trim());
  const hasCode = Boolean(String(codeContent || '').trim());
  const hasFiles = files?.length > 0;
  if (!hasText && !hasCode && !hasFiles) {
    return { ok: false, message: '请填写文字说明、代码内容或上传至少一个附件' };
  }
  return { ok: true };
}

module.exports = {
  loadTaskCodeRun,
  assertCodeRunBeforeSubmit,
  processUploadFile,
  processAllFiles,
  buildAttachmentParseBlocks,
  buildMergedContent,
  computeSubmissionCodeHash,
  validateSubmitInput,
  looksLikeCodeInText,
  insertAttachments,
  deleteBySubmissionId,
  updateAttachmentVision,
  updateAttachmentParsedText,
  ATTACHMENT_PARSE_MARKER,
};
