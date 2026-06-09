const express = require('express');
const router = express.Router();
const controller = require('../controllers/scheduleController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/calendar', authenticateToken, requireRole(['admin', 'teacher', 'student', 'enterprise']), controller.listCalendar);
router.get('/:id', authenticateToken, requireRole(['admin', 'teacher', 'student', 'enterprise']), controller.getScheduleById);
router.post('/', authenticateToken, requireRole(['admin', 'teacher']), controller.createSchedule);
router.put('/:id', authenticateToken, requireRole(['admin', 'teacher']), controller.updateSchedule);
router.delete('/:id', authenticateToken, requireRole(['admin', 'teacher']), controller.deleteSchedule);

module.exports = router;
