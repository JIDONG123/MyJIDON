const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');
const announcementController = require('../controllers/announcementController');
const analyticsController = require('../controllers/analyticsController');
const { authenticateToken, requireRole } = require('../middleware/auth');

/** 与 analytics 中 handler 一致，使用 params.classId */
const bindClassIdParam = (req, res, next) => {
  req.params.classId = req.params.id;
  next();
};

router.get('/public/names', classController.getPublicClassNames);

router.get(
  '/my/overview',
  authenticateToken,
  requireRole(['teacher']),
  classController.getMyTeachingOverview
);

router.get(
  '/my/latest-announcement',
  authenticateToken,
  requireRole(['student']),
  announcementController.getLatestForMyClass
);

router.get('/', authenticateToken, requireRole(['admin', 'teacher', 'enterprise']), classController.getAllClasses);

router.post(
  '/:id/students/batch',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  classController.addStudentsToClassBatch
);

router.post(
  '/:id/students',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  classController.addStudentToClass
);

router.get(
  '/:id/students',
  authenticateToken,
  requireRole(['admin', 'teacher', 'enterprise']),
  classController.getClassStudents
);

router.get(
  '/:id/announcements',
  authenticateToken,
  requireRole(['teacher', 'student']),
  announcementController.listAnnouncements
);
router.post(
  '/:id/announcements',
  authenticateToken,
  requireRole(['teacher']),
  announcementController.createAnnouncement
);
router.put(
  '/:id/announcements/:announcementId',
  authenticateToken,
  requireRole(['teacher']),
  announcementController.updateAnnouncement
);
router.delete(
  '/:id/announcements/:announcementId',
  authenticateToken,
  requireRole(['teacher']),
  announcementController.deleteAnnouncement
);

/** 分层推荐规则（挂到班级路由，避免部分环境下 /analytics 子路径未生效） */
router.get(
  '/:id/recommendation-rules',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  bindClassIdParam,
  analyticsController.getClassRecommendationRules
);
router.put(
  '/:id/recommendation-rules',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  bindClassIdParam,
  analyticsController.putClassRecommendationRules
);

router.get('/:id', authenticateToken, requireRole(['admin', 'teacher', 'enterprise']), classController.getClassById);
router.post('/', authenticateToken, requireRole(['admin']), classController.createClass);
router.put('/:id', authenticateToken, requireRole(['admin']), classController.updateClass);
router.delete('/:id', authenticateToken, requireRole(['admin']), classController.deleteClass);

module.exports = router;
