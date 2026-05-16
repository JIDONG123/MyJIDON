const express = require('express');
const router = express.Router();
const assistantController = require('../controllers/assistantController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/sessions', authenticateToken, requireRole(['student']), assistantController.listSessions);
router.post('/sessions', authenticateToken, requireRole(['student']), assistantController.createSession);
router.get(
  '/sessions/:sessionId/messages',
  authenticateToken,
  requireRole(['student']),
  assistantController.listMessages
);
router.post(
  '/sessions/:sessionId/messages',
  authenticateToken,
  requireRole(['student']),
  assistantController.postMessage
);

module.exports = router;
