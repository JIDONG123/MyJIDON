const express = require('express');
const router = express.Router();
const kgController = require('../controllers/kgController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { startKgModule } = require('../kg/bootstrap');

startKgModule();

router.get(
  '/sync-status',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  kgController.getSyncStatus
);

router.post(
  '/build',
  authenticateToken,
  requireRole(['admin', 'teacher', 'student']),
  kgController.postBuild
);

router.get(
  '/build/:jobId',
  authenticateToken,
  requireRole(['admin', 'teacher', 'student']),
  kgController.getBuildJob
);

router.get(
  '/course',
  authenticateToken,
  requireRole(['admin', 'teacher', 'student']),
  kgController.getCourseGraph
);

router.get(
  '/teacher-scopes',
  authenticateToken,
  requireRole(['teacher']),
  kgController.getTeacherScopes
);

router.get(
  '/teacher-graph',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  kgController.getTeacherGraph
);

router.get(
  '/class/:classId',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  kgController.getClassGraph
);

router.get(
  '/student/:studentId',
  authenticateToken,
  requireRole(['admin', 'teacher', 'student']),
  kgController.getStudentGraph
);

router.get(
  '/grading-context/:submissionId',
  authenticateToken,
  requireRole(['admin', 'teacher', 'student']),
  kgController.getGradingContext
);

router.post(
  '/reconcile',
  authenticateToken,
  requireRole(['admin']),
  kgController.postReconcile
);

module.exports = router;
