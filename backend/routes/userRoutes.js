const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const uploadAvatar = require('../middleware/uploadAvatar');
const { createLoginLimiter } = require('../utils/rateLimiter');
const loginLimiter = createLoginLimiter();

router.post('/register', userController.register);
router.post('/login', loginLimiter, userController.login);
router.post('/logout', authenticateToken, userController.logout);
router.get('/me', authenticateToken, userController.getUserInfo);
router.patch(
  '/me/profile',
  authenticateToken,
  requireRole(['teacher', 'student']),
  userController.updateMyProfile
);
router.patch(
  '/me/credentials',
  authenticateToken,
  requireRole(['teacher', 'student']),
  userController.updateMyCredentials
);
router.get('/me/archive', authenticateToken, requireRole(['student']), userController.getMyArchive);
router.post(
  '/me/avatar',
  authenticateToken,
  requireRole(['teacher', 'student']),
  uploadAvatar.single('avatar'),
  userController.uploadMyAvatar
);

router.get(
  '/students',
  authenticateToken,
  requireRole(['admin']),
  userController.listAdminStudents
);
router.get(
  '/teachers',
  authenticateToken,
  requireRole(['admin']),
  userController.listAdminTeachers
);
router.post('/student', authenticateToken, requireRole(['admin']), userController.createStudent);
router.post(
  '/students/:id/reset-initial-password',
  authenticateToken,
  requireRole(['admin']),
  userController.resetStudentInitialPassword
);
router.post(
  '/teachers/:id/reset-initial-password',
  authenticateToken,
  requireRole(['admin']),
  userController.resetTeacherInitialPassword
);

router.get(
  '/pick-students',
  authenticateToken,
  requireRole(['teacher', 'admin']),
  userController.searchStudentsForClass
);

router.get('/', authenticateToken, requireRole(['admin']), userController.getAllUsers);
router.post(
  '/enterprise-accounts',
  authenticateToken,
  requireRole(['admin']),
  userController.createEnterpriseUser
);
router.get(
  '/enterprise-accounts',
  authenticateToken,
  requireRole(['admin']),
  userController.listEnterpriseUsers
);
router.get(
  '/enterprise-accounts/:id/classes',
  authenticateToken,
  requireRole(['admin']),
  userController.getEnterpriseUserClasses
);
router.put(
  '/enterprise-accounts/:id/classes',
  authenticateToken,
  requireRole(['admin']),
  userController.setEnterpriseUserClasses
);
router.get(
  '/enterprise-accounts/:id/teaching-classes',
  authenticateToken,
  requireRole(['admin']),
  userController.getEnterpriseUserTeachingClasses
);
router.put(
  '/enterprise-accounts/:id/teaching-classes',
  authenticateToken,
  requireRole(['admin']),
  userController.setEnterpriseUserTeachingClasses
);
router.get('/:id', authenticateToken, requireRole(['admin']), userController.getUserById);
router.get('/:id/password', authenticateToken, requireRole(['admin']), userController.getAdminUserPassword);
router.put('/:id', authenticateToken, requireRole(['admin']), userController.updateUser);
router.delete('/:id', authenticateToken, requireRole(['admin']), userController.deleteUser);
router.post('/teacher', authenticateToken, requireRole(['admin']), userController.createTeacher);

module.exports = router;