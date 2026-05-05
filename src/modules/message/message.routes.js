const express = require("express");
const messageController = require("./message.controller");
const {
  authenticate,
  requirePasswordChangeCompleted,
} = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate, requirePasswordChangeCompleted);

/**
 * POST /api/messages/notify
 * Triggers FCM push notifications to group members.
 * Flutter writes messages directly to Firestore; this endpoint
 * is called after the write to push FCM alerts to recipients.
 */
router.post("/notify", messageController.notifyMessage);

module.exports = router;
