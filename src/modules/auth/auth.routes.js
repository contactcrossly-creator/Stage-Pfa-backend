const express = require('express');

const authController = require('./auth.controller');
const {
  authenticate,
  loginRateLimiter,
} = require('../../middlewares/auth.middleware');

const router = express.Router();

router.post('/login', loginRateLimiter, authController.login);
router.post('/change-password', authenticate, authController.changePassword);

module.exports = router;
