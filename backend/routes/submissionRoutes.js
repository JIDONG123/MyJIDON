const express = require('express');
const router = express.Router();
const submissionController = require('../controllers/submissionController');
const vlRecognitionController = require('../controllers/vlRecognitionController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { uploadSubmissionMiddleware } = require('../middleware/uploadSubmission');
const { createSubmitLimiter } = require('../utils/rateLimiter');
const { postBodyDedupe } = require('../middleware/postDedupe');

const submitLimiter = createSubmitLimiter();

router.post(
  '/',
  authenticateToken,
  requireRole(['student']),
  submitLimiter,
  uploadSubmissionMiddleware,
  postBodyDedupe,
  submissionController.submitAssignment
);
router.get(
  '/teacher/workbench',
  authenticateToken,
  requireRole(['teacher']),
  submissionController.getTeacherGradingWorkbench
);
router.get(
  '/task/:taskId',
  authenticateToken,
  requireRole(['admin', 'teacher', 'enterprise']),
  submissionController.getSubmissionsByTask
);
router.get('/student/me', authenticateToken, requireRole(['student']), submissionController.getStudentSubmissions);
router.get(
  '/student/task/:taskId',
  authenticateToken,
  requireRole(['student']),
  submissionController.getMySubmissionByTask
);
router.get(
  '/:id/similarity-compare',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  submissionController.getSimilarityCompare
);
router.get(
  '/:id/vl-recognition',
  authenticateToken,
  vlRecognitionController.getVlRecognition
);
router.post(
  '/:id/vl-recognize',
  authenticateToken,
  vlRecognitionController.postVlRecognize
);
router.get(
  '/:id/attachments/:attachmentId/download',
  authenticateToken,
  submissionController.downloadAttachment
);
router.get(
  '/:id/history',
  authenticateToken,
  submissionController.getSubmissionHistory
);
router.get('/:id', authenticateToken, submissionController.getSubmissionById);
router.delete('/:id', authenticateToken, requireRole(['admin', 'teacher']), submissionController.deleteSubmission);

module.exports = router;