const Joi = require('joi');

const objectIdSchema = Joi.string().trim().min(8).max(128);

const createGroupSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  description: Joi.string().trim().max(500).optional().allow(''),
  members: Joi.array().items(objectIdSchema).optional().default([]),
});

const updateGroupSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).optional(),
  description: Joi.string().trim().max(500).optional().allow(''),
  members: Joi.array().items(objectIdSchema).optional(),
});

const addMembersSchema = Joi.object({
  userIds: Joi.array().items(objectIdSchema.required()).min(1).required(),
});

const listGroupsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

const groupIdParamSchema = Joi.object({
  id: objectIdSchema.required(),
});

const memberIdParamSchema = Joi.object({
  id: objectIdSchema.required(),
  userId: objectIdSchema.required(),
});

module.exports = {
  createGroupSchema,
  updateGroupSchema,
  addMembersSchema,
  listGroupsQuerySchema,
  groupIdParamSchema,
  memberIdParamSchema,
};
