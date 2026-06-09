const express = require('express');
const router = express.Router();
const controller = require('../controllers/termController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, requireRole(['admin', 'teacher', 'student']), controller.listTerms);
router.get('/:id', authenticateToken, requireRole(['admin', 'teacher', 'student']), controller.getTermById);
router.post('/', authenticateToken, requireRole(['admin']), controller.createTerm);
router.put('/:id', authenticateToken, requireRole(['admin']), controller.updateTerm);
router.delete('/:id', authenticateToken, requireRole(['admin']), controller.deleteTerm);

module.exports = router;
