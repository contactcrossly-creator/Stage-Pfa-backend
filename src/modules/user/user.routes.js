const express = require('express');

const userController = require('./user.controller');
const {
  authenticate,
  requirePasswordChangeCompleted,
} = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const router = express.Router();

router.get('/me', authenticate, requirePasswordChangeCompleted, userController.getProfile);
router.get(
  '/admin-dashboard',
  authenticate,
  requirePasswordChangeCompleted,
  authorize('ADMIN'),
  userController.getAdminDashboard
);

module.exports = router;
