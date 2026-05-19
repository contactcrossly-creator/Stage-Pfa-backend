const express = require('express');

const dashboardController = require('./dashboard.controller');
const { authenticate, requirePasswordChangeCompleted } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const router = express.Router();

router.get(
  '/',
  authenticate,
  requirePasswordChangeCompleted,
  authorize('ADMIN'),
  dashboardController.getDashboardStats
);

module.exports = router;
