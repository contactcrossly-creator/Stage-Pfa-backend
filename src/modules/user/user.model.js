const Joi = require('joi');
const { ROLE_VALUES } = require('../../constants/roles');

const objectIdSchema = Joi.string().trim().min(8).max(128).required();

const createUserSchema = Joi.object({
  nom: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().trim().email().required(),
  role: Joi.string()
    .valid(...ROLE_VALUES)
    .required(),
  fcmToken: Joi.string().allow('', null).default(''),
  sendEmail: Joi.boolean().default(false),
});

const listUsersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  role: Joi.string()
    .valid(...ROLE_VALUES)
    .optional(),
  search: Joi.string().trim().allow('').max(120).default(''),
  includeInactive: Joi.boolean().truthy('true').falsy('false').default(false),
});

const userIdParamSchema = Joi.object({
  id: objectIdSchema,
});

const updateUserSchema = Joi.object({
  nom: Joi.string().trim().min(2).max(120).optional(),
  role: Joi.string()
    .valid(...ROLE_VALUES)
    .optional(),
})
  .min(1)
  .messages({
    'object.min': 'At least one field must be provided',
  });

module.exports = {
  createUserSchema,
  listUsersQuerySchema,
  userIdParamSchema,
  updateUserSchema,
};
