const Joi = require('joi');

const objectIdSchema = Joi.string().trim().min(8).max(128);

const createIncidentSchema = Joi.object({
  title: Joi.string().trim().min(5).max(200).required(),
  description: Joi.string().trim().min(10).max(2000).required(),
  type: Joi.string().valid('SAFETY', 'ENVIRONMENT', 'QUALITY').required(),
  priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').default('LOW'),
});

const updateIncidentSchema = Joi.object({
  title: Joi.string().trim().min(5).max(200).optional(),
  description: Joi.string().trim().min(10).max(2000).optional(),
  type: Joi.string().valid('SAFETY', 'ENVIRONMENT', 'QUALITY').optional(),
  priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
  status: Joi.string().valid('OPEN', 'IN_PROGRESS', 'RESOLVED').optional(),
  assignedTo: objectIdSchema.optional().allow(null),
});

const incidentIdParamSchema = Joi.object({
  id: objectIdSchema.required(),
});

const listIncidentsQuerySchema = Joi.object({
  status: Joi.string().valid('OPEN', 'IN_PROGRESS', 'RESOLVED').optional(),
  type: Joi.string().valid('SAFETY', 'ENVIRONMENT', 'QUALITY').optional(),
  priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = {
  createIncidentSchema,
  updateIncidentSchema,
  incidentIdParamSchema,
  listIncidentsQuerySchema,
};
