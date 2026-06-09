const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const contentSafetyController = require('../controllers/contentSafetyController');

const router = express.Router();

router.use(authenticateToken, requireRole(['admin']));

router.get('/reviews', contentSafetyController.listReviews);
router.get('/reviews/:id', contentSafetyController.getReviewDetail);
router.post('/reviews/:id/approve', contentSafetyController.approveReview);
router.post('/reviews/:id/reject', contentSafetyController.rejectReview);

module.exports = router;
