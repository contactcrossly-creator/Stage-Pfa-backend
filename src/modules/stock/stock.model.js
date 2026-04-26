const Joi = require('joi');

const objectIdSchema = Joi.string().trim().min(8).max(128);

const createProductSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  reference: Joi.string().trim().max(50).optional().allow(''),
  category: Joi.string().trim().max(100).optional().allow(''),
  quantity: Joi.number().integer().min(0).default(0),
  minThreshold: Joi.number().integer().min(0).default(5),
});

const updateProductSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).optional(),
  reference: Joi.string().trim().max(50).optional().allow(''),
  category: Joi.string().trim().max(100).optional().allow(''),
  quantity: Joi.number().integer().min(0).optional(),
  minThreshold: Joi.number().integer().min(0).optional(),
});

const recordMovementSchema = Joi.object({
  productId: objectIdSchema.required(),
  type: Joi.string().valid('IN', 'OUT').required(),
  quantity: Joi.number().integer().greater(0).required(),
  reason: Joi.string().trim().max(500).optional().allow(''),
});

const productIdParamSchema = Joi.object({
  id: objectIdSchema.required(),
});

const listMovementQuerySchema = Joi.object({
  productId: objectIdSchema.optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  recordMovementSchema,
  productIdParamSchema,
  listMovementQuerySchema,
};
