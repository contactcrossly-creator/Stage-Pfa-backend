const express = require('express');

const qualityController = require('./quality.controller');
const {
  authenticate,
  requirePasswordChangeCompleted,
} = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate, requirePasswordChangeCompleted);

// GET routes - Accessible by all authenticated users
router.get('/', qualityController.getTests);
router.get('/:id', qualityController.getTest);

// POST and PATCH routes - Restricted to ADMIN and QUALITY roles
router.post('/', authorize('ADMIN', 'QUALITY'), qualityController.createTest);
router.patch('/:id', authorize('ADMIN', 'QUALITY'), qualityController.updateTest);

module.exports = router;
