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

// Modification routes - Restricted to ADMIN and EMPLOYEE
router.post('/', authorize('ADMIN', 'EMPLOYEE'), productionController.createProduction);
router.patch('/:id/start', authorize('ADMIN', 'EMPLOYEE'), productionController.startProduction);
router.patch('/:id/complete', authorize('ADMIN', 'EMPLOYEE'), productionController.completeProduction);
router.patch('/:id/cancel', authorize('ADMIN', 'EMPLOYEE'), productionController.cancelProduction);

module.exports = router;
