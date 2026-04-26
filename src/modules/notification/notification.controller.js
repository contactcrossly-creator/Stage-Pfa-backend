const notificationService = require('./notification.service');
const { createNotificationSchema, notificationIdParamSchema } = require('./notification.model');
const { AppError } = require('../../utils/app-error.util');

const validate = (schema, payload) => {
  const { value, error } = schema.validate(payload, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new AppError('Validation error', 400, {
      fields: error.details.map((detail) => ({
        message: detail.message,
        path: detail.path.join('.'),
      })),
    });
  }
  return value;
};

const sendManualNotification = async (req, res, next) => {
  try {
    const validatedPayload = validate(createNotificationSchema, req.body);
    await notificationService.sendNotification(validatedPayload);
    res.status(201).json({ status: 'success', message: 'Notification(s) sent successfully' });
  } catch (error) {
    next(error);
  }
};

const getMyNotifications = async (req, res, next) => {
  try {
    const notifications = await notificationService.listMyNotifications(req.user.userId);
    res.status(200).json({ status: 'success', data: { notifications } });
  } catch (error) {
    next(error);
  }
};

const getAllNotifications = async (req, res, next) => {
  try {
    const notifications = await notificationService.listAllNotifications();
    res.status(200).json({ status: 'success', data: { notifications } });
  } catch (error) {
    next(error);
  }
};

const markRead = async (req, res, next) => {
  try {
    validate(notificationIdParamSchema, req.params);
    const result = await notificationService.markAsRead(req.params.id, req.user.userId);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendManualNotification,
  getMyNotifications,
  getAllNotifications,
  markRead,
};
