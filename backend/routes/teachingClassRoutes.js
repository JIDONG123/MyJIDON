const express = require('express');
const router = express.Router();
const controller = require('../controllers/teachingClassController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/mine', authenticateToken, requireRole(['teacher', 'student', 'enterprise', 'admin']), controller.listMyTeachingClasses);
router.get('/', authenticateToken, requireRole(['admin', 'teacher', 'student', 'enterprise']), controller.listTeachingClasses);
router.get('/:id', authenticateToken, requireRole(['admin', 'teacher', 'student', 'enterprise']), controller.getTeachingClassById);
router.post('/', authenticateToken, requireRole(['admin', 'teacher']), controller.createTeachingClass);
router.put('/:id', authenticateToken, requireRole(['admin', 'teacher']), controller.updateTeachingClass);
router.delete('/:id', authenticateToken, requireRole(['admin']), controller.deleteTeachingClass);
router.put('/:id/teachers', authenticateToken, requireRole(['admin', 'teacher']), controller.setTeachingClassTeachers);
router.put('/:id/students', authenticateToken, requireRole(['admin', 'teacher']), controller.setTeachingClassStudents);

module.exports = router;
