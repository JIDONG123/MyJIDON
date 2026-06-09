const express = require('express');
const router = express.Router();
const controller = require('../controllers/projectTemplateController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, requireRole(['admin', 'teacher']), controller.listProjectTemplates);
router.get('/:id', authenticateToken, requireRole(['admin', 'teacher']), controller.getProjectTemplateById);
router.post('/', authenticateToken, requireRole(['admin', 'teacher']), controller.createProjectTemplate);
router.put('/:id', authenticateToken, requireRole(['admin', 'teacher']), controller.updateProjectTemplate);
router.delete('/:id', authenticateToken, requireRole(['admin', 'teacher']), controller.deleteProjectTemplate);
router.post('/:id/spawn-task', authenticateToken, requireRole(['admin', 'teacher']), controller.spawnTaskFromTemplate);

module.exports = router;
