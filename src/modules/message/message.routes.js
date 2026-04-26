const express = require('express');

const messageController = require('./message.controller');
const {
  authenticate,
  requirePasswordChangeCompleted,
} = require('../../middlewares/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate, requirePasswordChangeCompleted);

// Send message
router.post('/', messageController.sendMessage);

// Get messages by group
router.get('/', messageController.getMessages);

module.exports = router;
