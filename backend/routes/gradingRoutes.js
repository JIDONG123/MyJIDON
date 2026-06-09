const express = require('express');
const router = express.Router();
const gradingController = require('../controllers/gradingController');
const gradingJobRoutes = require('./gradingJobRoutes');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  createGradingLimiter,
  createBatchLimiter,
} = require('../utils/rateLimiter');
const { postBodyDedupe } = require('../middleware/postDedupe');

const gradingLimiter = createGradingLimiter();
const batchLimiter = createBatchLimiter();

router.post(
  '/ai/:submissionId',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  gradingLimiter,
  postBodyDedupe,
  gradingController.aiGradeSubmission
);
router.post(
  '/batch/:taskId',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  batchLimiter,
  postBodyDedupe,
  gradingController.batchAiGrade
);
router.get(
  '/tasks/:taskId/eligible-submissions',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  gradingController.getEligibleSubmissions
);
router.get(
  '/batch-progress/:batchId',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  gradingController.getBatchGradingProgress
);

router.use(gradingJobRoutes);

router.put(
  '/human/:submissionId',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  postBodyDedupe,
  gradingController.humanReview
);
router.put(
  '/enterprise/:submissionId',
  authenticateToken,
  requireRole(['enterprise']),
  postBodyDedupe,
  gradingController.enterpriseReview
);
router.patch(
  '/verification/:submissionId',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  gradingController.patchVerificationOverride
);
router.get('/student/me', authenticateToken, requireRole(['student']), gradingController.getStudentGradingResults);
router.get('/:submissionId', authenticateToken, gradingController.getGradingResult);

module.exports = router;