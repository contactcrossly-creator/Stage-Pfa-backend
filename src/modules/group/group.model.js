const Joi = require('joi');

const objectIdSchema = Joi.string().trim().min(8).max(128).required();

const createGroupSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
});

const assignUsersToGroupSchema = Joi.object({
  userIds: Joi.array().items(objectIdSchema).min(1).required(),
});

const groupIdParamSchema = Joi.object({
  id: objectIdSchema,
});

module.exports = {
  createGroupSchema,
  assignUsersToGroupSchema,
  groupIdParamSchema,
};
