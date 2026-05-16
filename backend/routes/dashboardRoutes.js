const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get(
  '/stats',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  dashboardController.getDashboardStats
);
router.get('/class/:classId', authenticateToken, requireRole(['admin', 'teacher']), dashboardController.getClassStatistics);
router.get('/class/:classId/export', authenticateToken, requireRole(['admin', 'teacher']), dashboardController.exportClassScores);
router.get('/classes', authenticateToken, requireRole(['admin', 'teacher']), dashboardController.getAllClassStatistics);
router.get(
  '/big-screen',
  authenticateToken,
  requireRole(['admin', 'teacher', 'student', 'enterprise']),
  dashboardController.getBigScreenStats
);

module.exports = router;