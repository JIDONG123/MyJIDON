const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { uploadTeacherImport } = require('../middleware/uploadTeacherImport');
const teacherImportController = require('../controllers/teacherImportController');

router.use(authenticateToken, requireRole(['admin']));

router.get('/summary', teacherImportController.getSummary);
router.get('/import-template', teacherImportController.downloadTemplate);
router.post(
  '/import-preview',
  uploadTeacherImport.single('file'),
  teacherImportController.importPreview
);
router.post('/import-confirm/:batchId', teacherImportController.importConfirm);
router.get('/import-batches', teacherImportController.listImportBatches);
router.get('/import-batches/:batchId', teacherImportController.getImportBatchDetail);
router.get('/import-batches/:batchId/result', teacherImportController.downloadImportResult);

module.exports = router;
