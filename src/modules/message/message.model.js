const Joi = require('joi');

const objectIdSchema = Joi.string().trim().min(8).max(128);

const sendMessageSchema = Joi.object({
  groupId: objectIdSchema.required(),
  content: Joi.string().trim().min(1).max(1000).required(),
});

const listMessagesQuerySchema = Joi.object({
  groupId: objectIdSchema.required(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = {
  sendMessageSchema,
  listMessagesQuerySchema,
};
