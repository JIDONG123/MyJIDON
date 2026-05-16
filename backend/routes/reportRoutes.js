const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get(
  '/personal/:submissionId/pdf',
  authenticateToken,
  requireRole(['admin', 'teacher', 'student']),
  reportController.exportPersonalPdf
);

router.get(
  '/class/:classId/pdf',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  reportController.exportClassPdf
);

module.exports = router;
