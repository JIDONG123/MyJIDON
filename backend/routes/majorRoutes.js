const express = require('express');
const router = express.Router();
const controller = require('../controllers/majorController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, requireRole(['admin', 'teacher', 'student']), controller.listMajors);
router.get('/:id', authenticateToken, requireRole(['admin', 'teacher', 'student']), controller.getMajorById);
router.post('/', authenticateToken, requireRole(['admin']), controller.createMajor);
router.put('/:id', authenticateToken, requireRole(['admin']), controller.updateMajor);
router.delete('/:id', authenticateToken, requireRole(['admin']), controller.deleteMajor);

module.exports = router;
