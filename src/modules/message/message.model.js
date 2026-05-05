const Joi = require("joi");

const objectIdSchema = Joi.string().trim().min(8).max(128);

// Schema for triggering a push notification after a message is written to Firestore directly by Flutter
const notifyMessageSchema = Joi.object({
  groupId: objectIdSchema.required(),
  content: Joi.string().trim().min(1).max(1000).required(),
});

module.exports = { notifyMessageSchema };
