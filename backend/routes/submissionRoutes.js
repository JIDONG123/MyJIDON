const express = require('express');
const router = express.Router();
const submissionController = require('../controllers/submissionController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { createSubmitLimiter } = require('../utils/rateLimiter');
const { postBodyDedupe } = require('../middleware/postDedupe');

const submitLimiter = createSubmitLimiter();

router.post(
  '/',
  authenticateToken,
  requireRole(['student']),
  submitLimiter,
  upload.single('file'),
  postBodyDedupe,
  submissionController.submitAssignment
);
router.get(
  '/task/:taskId',
  authenticateToken,
  requireRole(['admin', 'teacher', 'enterprise']),
  submissionController.getSubmissionsByTask
);
router.get('/student/me', authenticateToken, requireRole(['student']), submissionController.getStudentSubmissions);
router.get(
  '/:id/similarity-compare',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  submissionController.getSimilarityCompare
);
router.get('/:id', authenticateToken, submissionController.getSubmissionById);
router.delete('/:id', authenticateToken, requireRole(['admin', 'teacher']), submissionController.deleteSubmission);

module.exports = router;