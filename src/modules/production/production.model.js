const Joi = require('joi');

const objectIdSchema = Joi.string().trim().min(8).max(128);

const createProductionSchema = Joi.object({
  productId: objectIdSchema.required(),
  quantityPlanned: Joi.number().integer().greater(0).required(),
});

const completeProductionSchema = Joi.object({
  quantityProduced: Joi.number().integer().min(0).required(),
});

const productionIdParamSchema = Joi.object({
  id: objectIdSchema.required(),
});

module.exports = {
  createProductionSchema,
  completeProductionSchema,
  productionIdParamSchema,
};
