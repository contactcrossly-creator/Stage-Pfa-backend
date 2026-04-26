const Joi = require('joi');

const objectIdSchema = Joi.string().trim().min(8).max(128);

const createNotificationSchema = Joi.object({
  title: Joi.string().trim().min(2).max(200).required(),
  message: Joi.string().trim().min(2).max(1000).required(),
  type: Joi.string().valid('INFO', 'ALERT', 'WARNING').default('INFO'),
  targetType: Joi.string().valid('USER', 'ROLE', 'ALL').required(),
  targetValue: Joi.string().trim().allow(null, '').when('targetType', {
    is: Joi.string().valid('USER', 'ROLE'),
    then: Joi.required(),
  }),
});

const notificationIdParamSchema = Joi.object({
  id: objectIdSchema.required(),
});

module.exports = {
  createNotificationSchema,
  notificationIdParamSchema,
};
