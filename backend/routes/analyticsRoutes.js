const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get(
  '/class/:classId/weak',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  analyticsController.getClassWeak
);
router.get(
  '/student/me/class-weak',
  authenticateToken,
  requireRole(['student']),
  analyticsController.getMyClassWeak
);
router.get('/student/me/profile', authenticateToken, requireRole(['student']), analyticsController.getMyLearningProfile);
router.get(
  '/student/me/recommendations',
  authenticateToken,
  requireRole(['student']),
  analyticsController.getMyRecommendations
);
router.get(
  '/teacher/assistant-stats',
  authenticateToken,
  requireRole(['teacher', 'admin']),
  analyticsController.getAssistantTeacherStats
);

module.exports = router;
