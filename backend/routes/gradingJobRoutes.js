const express = require('express');
const router = express.Router();
const gradingJobController = require('../controllers/gradingJobController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { createGradingLimiter, createBatchLimiter } = require('../utils/rateLimiter');
const { postBodyDedupe } = require('../middleware/postDedupe');

const gradingLimiter = createGradingLimiter();
const batchLimiter = createBatchLimiter();

router.post(
  '/jobs',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  batchLimiter,
  postBodyDedupe,
  gradingJobController.createJob
);

router.get(
  '/jobs',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  gradingJobController.listJobs
);

router.get(
  '/jobs/:id',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  gradingJobController.getJob
);

router.post(
  '/jobs/:id/cancel',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  gradingJobController.cancelJob
);

router.post(
  '/jobs/:id/retry',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  gradingJobController.retryJob
);

router.get(
  '/worker-health',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  gradingJobController.workerHealth
);

module.exports = router;
