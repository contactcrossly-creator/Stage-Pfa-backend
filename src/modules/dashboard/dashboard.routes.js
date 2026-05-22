const express = require('express');

const dashboardController = require('./dashboard.controller');
const { authenticate, requirePasswordChangeCompleted } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get(
  '/',
  authenticate,
  requirePasswordChangeCompleted,
  dashboardController.getDashboardStats
);

module.exports = router;
