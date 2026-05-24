const express = require('express');

const scanController = require('./scan.controller');
const {
  authenticate,
  requirePasswordChangeCompleted,
} = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate, requirePasswordChangeCompleted);
router.post('/', scanController.scan);

module.exports = router;
