const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, notificationController.listNotifications);
router.get('/unread-count', authenticateToken, notificationController.unreadCount);
router.patch('/read-all', authenticateToken, notificationController.markAllRead);
router.patch('/:id/read', authenticateToken, notificationController.markRead);

module.exports = router;
