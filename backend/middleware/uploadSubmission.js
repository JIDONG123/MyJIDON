const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { decodeMultipartFilename } = require('../utils/filenameEncoding');
const { MAX_ATTACHMENTS, MAX_FILE_BYTES, isAllowedSubmissionExt } = require('../utils/submissionAttachConfig');

const uploadRoot = process.env.UPLOAD_PATH
  ? path.resolve(process.env.UPLOAD_PATH)
  : path.join(__dirname, '..', 'uploads');

const submissionDir = path.join(uploadRoot, 'submissions');
if (!fs.existsSync(submissionDir)) {
  fs.mkdirSync(submissionDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, submissionDir);
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeBase = decodeMultipartFilename(file.originalname);
    cb(null, `${uniqueSuffix}-${safeBase}`);
  },
});

function fileFilter(req, file, cb) {
  const name = decodeMultipartFilename(file.originalname);
  if (!isAllowedSubmissionExt(name)) {
    return cb(new Error(`文件类型不支持：${name}`), false);
  }
  cb(null, true);
}

const uploadMulti = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_ATTACHMENTS },
});

/** multipart: files[] + fields; 兼容旧单 file 字段 */
function uploadSubmissionMiddleware(req, res, next) {
  uploadMulti.any()(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? '文件过大，最大支持 50MB' : err.message || '上传失败';
      return res.status(400).json({ success: false, message: msg });
    }
    const files = req.files || [];
    const legacy = files.filter((f) => f.fieldname === 'file');
    const multi = files.filter((f) => f.fieldname === 'files' || f.fieldname === 'files[]');
    req.uploadFiles = multi.length ? multi : legacy;
    if (req.uploadFiles.length > MAX_ATTACHMENTS) {
      for (const f of req.uploadFiles) {
        try {
          if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
        } catch (_) {}
      }
      return res.status(400).json({ success: false, message: `最多上传 ${MAX_ATTACHMENTS} 个附件` });
    }
    const total = req.uploadFiles.reduce((s, f) => s + (f.size || 0), 0);
    const maxTotal = parseInt(process.env.SUBMISSION_MAX_TOTAL_BYTES || String(100 * 1024 * 1024), 10);
    if (total > maxTotal) {
      for (const f of req.uploadFiles) {
        try {
          if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
        } catch (_) {}
      }
      return res.status(400).json({ success: false, message: '附件总大小超过限制（最大 100MB）' });
    }
    next();
  });
}

module.exports = { uploadSubmissionMiddleware, uploadMulti };
