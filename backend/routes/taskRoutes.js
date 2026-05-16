const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, taskController.getAllTasks);
router.get(
  '/class/:classId',
  authenticateToken,
  requireRole(['student', 'teacher', 'admin', 'enterprise']),
  taskController.getTasksByClass
);
router.get(
  '/:id/submission-overview',
  authenticateToken,
  requireRole(['teacher', 'admin']),
  taskController.getTaskSubmissionOverview
);
router.get('/:id', authenticateToken, taskController.getTaskById);
router.post('/', authenticateToken, requireRole(['admin', 'teacher']), taskController.createTask);
router.put('/:id', authenticateToken, requireRole(['admin', 'teacher']), taskController.updateTask);
router.delete('/:id', authenticateToken, requireRole(['admin', 'teacher']), taskController.deleteTask);

module.exports = router;