const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { decodeMultipartFilename } = require('../utils/filenameEncoding');

const uploadRoot = process.env.UPLOAD_PATH
  ? path.resolve(process.env.UPLOAD_PATH)
  : path.join(__dirname, '..', 'uploads');

const kbDir = path.join(uploadRoot, 'kb');
if (!fs.existsSync(kbDir)) {
  fs.mkdirSync(kbDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, kbDir);
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeBase = decodeMultipartFilename(file.originalname);
    cb(null, `${uniqueSuffix}-${safeBase}`);
  },
});

function fileFilter(_req, file, cb) {
  const name = (file.originalname || '').toLowerCase();
  const okExt = /\.(pdf|docx|txt|md)$/i.test(name);
  const okMime = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
  ].includes(file.mimetype);
  if (okExt || okMime) {
    cb(null, true);
  } else {
    cb(new Error('知识库仅支持 Word(docx)、PDF、TXT、Markdown'), false);
  }
}

const uploadKb = multer({
  storage,
  fileFilter,
  limits: { fileSize: 30 * 1024 * 1024 },
});

module.exports = uploadKb;
