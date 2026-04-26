const express = require('express');

const notificationController = require('./notification.controller');
const {
  authenticate,
  requirePasswordChangeCompleted,
} = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate, requirePasswordChangeCompleted);

// Current user notifications
router.get('/me', notificationController.getMyNotifications);

// Mark as read
router.patch('/:id/read', notificationController.markRead);

// Admin only: manual send and list all
router.post('/', authorize('ADMIN'), notificationController.sendManualNotification);
router.get('/', authorize('ADMIN'), notificationController.getAllNotifications);

module.exports = router;
