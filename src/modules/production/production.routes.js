const express = require('express');

const productionController = require('./production.controller');
const {
  authenticate,
  requirePasswordChangeCompleted,
} = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate, requirePasswordChangeCompleted);

// View routes - All authenticated users
router.get('/', productionController.getProductions);
router.get('/:id', productionController.getProduction);

// Modification routes - Restricted to ADMIN and PRODUCTION
router.post('/', authorize('ADMIN', 'PRODUCTION'), productionController.createProduction);
router.patch('/:id/start', authorize('ADMIN', 'PRODUCTION'), productionController.startProduction);
router.patch('/:id/complete', authorize('ADMIN', 'PRODUCTION'), productionController.completeProduction);
router.patch('/:id/cancel', authorize('ADMIN', 'PRODUCTION'), productionController.cancelProduction);

module.exports = router;
