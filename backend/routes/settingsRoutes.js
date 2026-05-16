const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, requireRole(['admin']), settingsController.getSettings);
router.post(
  '/test-llm',
  authenticateToken,
  requireRole(['admin']),
  settingsController.testLlmConnection,
);
router.post(
  '/test-embedding',
  authenticateToken,
  requireRole(['admin']),
  settingsController.testEmbeddingConnection,
);
router.put('/', authenticateToken, requireRole(['admin']), settingsController.updateSettings);

module.exports = router;
