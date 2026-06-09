const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const exportLogController = require('../controllers/exportLogController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get(
  '/logs',
  authenticateToken,
  requireRole(['teacher', 'admin']),
  exportLogController.listLogs
);
router.get(
  '/scores',
  authenticateToken,
  requireRole(['teacher', 'admin']),
  exportController.exportScoresExcel
);
router.get(
  '/submissions-zip',
  authenticateToken,
  requireRole(['teacher', 'admin']),
  exportController.exportSubmissionsZip
);

module.exports = router;
