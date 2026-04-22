const Joi = require('joi');
const { ROLE_VALUES } = require('../../constants/roles');

const loginSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  password: Joi.string().min(8).max(128).required(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(8).max(128).required(),
  newPassword: Joi.string()
    .min(10)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/)
    .required()
    .messages({
      'string.pattern.base':
        'New password must contain uppercase, lowercase, number, and special character',
    }),
});

const seedAdminSchema = Joi.object({
  nom: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().trim().email().required(),
  password: Joi.string()
    .min(10)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/)
    .required(),
  role: Joi.string()
    .valid(...ROLE_VALUES)
    .default('ADMIN'),
  mustChangePassword: Joi.boolean().default(true),
  fcmToken: Joi.string().allow('', null).default(''),
});

module.exports = {
  loginSchema,
  changePasswordSchema,
  seedAdminSchema,
};
