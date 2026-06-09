const express = require('express');
const router = express.Router();
const codeRunController = require('../controllers/codeRunController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { requireCodeRunnerEnabled } = require('../middleware/codeRunnerGate');
const { createCodeRunLimiter } = require('../utils/rateLimiter');
const { postBodyDedupe } = require('../middleware/postDedupe');

const codeRunLimiter = createCodeRunLimiter();

router.use(requireCodeRunnerEnabled);

router.post(
  '/jobs',
  authenticateToken,
  requireRole(['admin', 'teacher', 'student']),
  codeRunLimiter,
  postBodyDedupe,
  codeRunController.createJob
);

router.get(
  '/jobs',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  codeRunController.listJobs
);

router.get(
  '/jobs/:id',
  authenticateToken,
  requireRole(['admin', 'teacher', 'student']),
  codeRunController.getJob
);

router.get(
  '/jobs/:id/result',
  authenticateToken,
  requireRole(['admin', 'teacher', 'student']),
  codeRunController.getJobResult
);

router.post(
  '/jobs/:id/cancel',
  authenticateToken,
  requireRole(['admin', 'teacher', 'student']),
  codeRunController.cancelJob
);

module.exports = router;
