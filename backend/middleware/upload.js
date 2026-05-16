const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { decodeMultipartFilename } = require('../utils/filenameEncoding');

// 使用相对路径 ./uploads 会依赖进程 cwd，且目录不存在时 Multer 写入会 ENOENT → 500
const uploadRoot = process.env.UPLOAD_PATH
  ? path.resolve(process.env.UPLOAD_PATH)
  : path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadRoot);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeBase = decodeMultipartFilename(file.originalname);
    cb(null, uniqueSuffix + '-' + safeBase);
  }
});

/** 与 ZIP 内允许解析的文本/文档类型对齐；扩展名优先（浏览器常报 octet-stream） */
const ALLOW_UPLOAD_EXT =
  /\.(doc|docx|pdf|txt|md|csv|js|mjs|cjs|ts|tsx|jsx|vue|json|html|htm|css|scss|less|java|py|c|cpp|cc|h|hpp|go|php|rb|rs|sql|sh|bat|zip|rar|png|jpe?g|gif|webp|bmp|xlsx?|pptx?|xml|yaml|yml|properties|gradle|cs|kt|swift)$/i;

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/css',
    'text/html',
    'application/json',
    'application/javascript',
    'text/javascript',
    'application/typescript',
    'text/typescript',
    'text/x-java-source',
    'text/x-python',
    'application/x-python-code',
    'text/python',
    'application/x-zip-compressed',
    'application/zip',
    'application/octet-stream',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/bmp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
  ];

  const name = file.originalname || '';
  const extOk = ALLOW_UPLOAD_EXT.test(name);

  if (allowedTypes.includes(file.mimetype) || extOk) {
    cb(null, true);
    return;
  }
  cb(new Error(`不支持的文件类型（${file.mimetype || '未知'}），请使用常见源码/文档或 zip 压缩包`), false);
};

const upload = multer({ 
  storage: storage, 
  fileFilter: fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }
});

module.exports = upload;