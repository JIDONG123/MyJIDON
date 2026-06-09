const express = require('express');
const router = express.Router();
const controller = require('../controllers/courseController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/mine', authenticateToken, requireRole(['teacher']), controller.listMyCourses);
router.get('/', authenticateToken, requireRole(['admin', 'teacher', 'student']), controller.listCourses);
router.get('/:id', authenticateToken, requireRole(['admin', 'teacher', 'student']), controller.getCourseById);
router.post('/', authenticateToken, requireRole(['admin']), controller.createCourse);
router.put('/:id', authenticateToken, requireRole(['admin']), controller.updateCourse);
router.delete('/:id', authenticateToken, requireRole(['admin']), controller.deleteCourse);

module.exports = router;
