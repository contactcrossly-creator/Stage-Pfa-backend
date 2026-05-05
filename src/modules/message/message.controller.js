const messageService = require("./message.service");

/**
 * POST /api/messages/notify
 * Called by Flutter after it writes a message directly to Firestore.
 * Triggers FCM push notifications to all other group members.
 */
const notifyMessage = async (req, res, next) => {
  try {
    const result = await messageService.notifyGroupMembers(req.body, req.user);
    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { notifyMessage };
