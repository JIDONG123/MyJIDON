const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const uploadVlTest = require('../middleware/uploadVlTest');

const adminOnly = [authenticateToken, requireRole(['admin'])];

router.get('/', ...adminOnly, settingsController.getSettings);
router.get('/ai', ...adminOnly, settingsController.getAiSettings);
router.put('/', ...adminOnly, settingsController.updateSettings);
router.post('/qwen-vl', ...adminOnly, settingsController.updateQwenVlSettings);
router.post('/kg-neo4j', ...adminOnly, settingsController.updateKgNeo4jSettings);
router.post('/kg-neo4j/test', ...adminOnly, settingsController.testKgNeo4jSettings);
router.post('/kg-neo4j/stats', ...adminOnly, settingsController.getKgNeo4jStats);
router.post('/kg-neo4j/reconcile-once', ...adminOnly, settingsController.reconcileKgOnce);
router.post(
  '/test-llm',
  ...adminOnly,
  settingsController.testLlmConnection,
);
router.post(
  '/test-embedding',
  ...adminOnly,
  settingsController.testEmbeddingConnection,
);
router.post(
  '/qwen-vl/test',
  ...adminOnly,
  (req, res, next) => {
    uploadVlTest.single('image')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message || '图片上传失败' });
      }
      next();
    });
  },
  settingsController.testQwenVlSettings,
);

module.exports = router;
