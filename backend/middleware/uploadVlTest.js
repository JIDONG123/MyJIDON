const multer = require('multer');

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const uploadVlTest = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('仅支持 JPG / PNG / WEBP 格式的测试图片（最大 5MB）'));
  },
});

module.exports = uploadVlTest;
