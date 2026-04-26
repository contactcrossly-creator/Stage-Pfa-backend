const Joi = require('joi');

const objectIdSchema = Joi.string().trim().min(8).max(128);

const createQualityTestSchema = Joi.object({
  batchId: objectIdSchema.required(),
  notes: Joi.string().trim().max(1000).optional().allow(''),
});

const updateQualityTestSchema = Joi.object({
  status: Joi.string().valid('PASSED', 'FAILED').required(),
  notes: Joi.string().trim().max(1000).optional().allow(''),
});

const testIdParamSchema = Joi.object({
  id: objectIdSchema.required(),
});

const listTestsQuerySchema = Joi.object({
  batchId: objectIdSchema.optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = {
  createQualityTestSchema,
  updateQualityTestSchema,
  testIdParamSchema,
  listTestsQuerySchema,
};
