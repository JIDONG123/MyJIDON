const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { uploadStudentImport } = require('../middleware/uploadStudentImport');
const studentImportController = require('../controllers/studentImportController');

router.use(authenticateToken, requireRole(['admin']));

router.get('/summary', studentImportController.getSummary);
router.get('/import-template', studentImportController.downloadTemplate);
router.post(
  '/import-preview',
  uploadStudentImport.single('file'),
  studentImportController.importPreview
);
router.post('/import-confirm/:batchId', studentImportController.importConfirm);
router.get('/import-batches', studentImportController.listImportBatches);
router.get('/import-batches/:batchId', studentImportController.getImportBatchDetail);
router.get('/import-batches/:batchId/result', studentImportController.downloadImportResult);

module.exports = router;
