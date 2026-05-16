const express = require('express');
const router = express.Router();
const kbController = require('../controllers/kbController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const uploadKb = require('../middleware/uploadKb');

router.get('/documents', authenticateToken, requireRole(['teacher']), kbController.listKbDocuments);

router.post(
  '/documents',
  authenticateToken,
  requireRole(['teacher']),
  uploadKb.single('file'),
  kbController.uploadKbDocument
);

router.delete('/documents/:id', authenticateToken, requireRole(['teacher']), kbController.deleteKbDocument);

module.exports = router;
