const express = require('express');
const router = express.Router();
const onlinePracticeController = require('../controllers/onlinePracticeController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { requireCodeRunnerEnabled } = require('../middleware/codeRunnerGate');
const { requireOnlinePracticeAiReviewEnabled } = require('../middleware/onlinePracticeAiReviewGate');
const { createCodeRunLimiter } = require('../utils/rateLimiter');
const { postBodyDedupe } = require('../middleware/postDedupe');

const codeRunLimiter = createCodeRunLimiter();

router.use(requireCodeRunnerEnabled);

router.get(
  '/templates',
  authenticateToken,
  requireRole(['admin', 'teacher', 'student']),
  onlinePracticeController.listTemplates
);

router.post(
  '/templates',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  onlinePracticeController.createTemplate
);

router.get(
  '/templates/:id',
  authenticateToken,
  requireRole(['admin', 'teacher', 'student']),
  onlinePracticeController.getTemplate
);

router.put(
  '/templates/:id',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  onlinePracticeController.updateTemplate
);

router.post(
  '/templates/:id/publish',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  onlinePracticeController.publishTemplate
);

router.post(
  '/templates/:id/close',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  onlinePracticeController.closeTemplate
);

router.post(
  '/templates/:id/open',
  authenticateToken,
  requireRole(['student']),
  onlinePracticeController.openTemplate
);

router.get(
  '/attempts/mine',
  authenticateToken,
  requireRole(['student']),
  onlinePracticeController.listMyAttempts
);

router.get(
  '/attempts/:id',
  authenticateToken,
  requireRole(['student']),
  onlinePracticeController.getAttempt
);

router.put(
  '/attempts/:id/source',
  authenticateToken,
  requireRole(['student']),
  onlinePracticeController.saveSource
);

router.post(
  '/attempts/:id/run',
  authenticateToken,
  requireRole(['student']),
  codeRunLimiter,
  postBodyDedupe,
  onlinePracticeController.runAttempt
);

router.get(
  '/ai-review/status',
  authenticateToken,
  requireRole(['admin', 'teacher', 'student']),
  onlinePracticeController.getAiReviewStatus
);

router.get(
  '/attempts/:id/ai-review/latest',
  authenticateToken,
  requireRole(['student']),
  onlinePracticeController.getLatestAiReview
);

router.post(
  '/attempts/:id/ai-review',
  authenticateToken,
  requireRole(['student']),
  requireOnlinePracticeAiReviewEnabled,
  postBodyDedupe,
  onlinePracticeController.createAiReview
);

module.exports = router;
