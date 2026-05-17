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

// Shared reports history - ADMIN only
router.get('/shared-reports', authorize('ADMIN'), qualityController.getSharedReports);

// Report routes - ADMIN and QUALITY
router.get('/report/share', authorize('ADMIN', 'QUALITY'), qualityController.shareTestsReport);
router.post('/report/share', authorize('QUALITY'), qualityController.shareTestsReport);
router.get('/report/:id/share', authorize('ADMIN', 'QUALITY'), qualityController.shareTestReport);
router.post('/report/:id/share', authorize('QUALITY'), qualityController.shareTestReport);
router.get('/report', authorize('ADMIN', 'QUALITY'), qualityController.downloadTestsReport);
router.get('/report/:id', authorize('ADMIN', 'QUALITY'), qualityController.downloadTestReport);

router.get('/:id', qualityController.getTest);

// POST and PATCH routes - Restricted to ADMIN and QUALITY roles
router.post('/', authorize('ADMIN', 'QUALITY'), qualityController.createTest);
router.patch('/:id', authorize('ADMIN', 'QUALITY'), qualityController.updateTest);

module.exports = router;
