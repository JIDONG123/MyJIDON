const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const { authenticateToken, requireRole } = require('../middleware/auth');

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
