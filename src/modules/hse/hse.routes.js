const express = require('express');

const hseController = require('./hse.controller');
const {
  authenticate,
  requirePasswordChangeCompleted,
} = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate, requirePasswordChangeCompleted);

// Create Incident - Any user
router.post('/', hseController.createIncident);

// My Incidents - Any user
router.get('/my', hseController.getMyIncidents);

// Get Single Incident - Any user
router.get('/:id', hseController.getIncident);

// List All Incidents - HSE and ADMIN usually see everything, 
// using service-level logic for filtering but exposing the route to all for visibility
router.get('/', hseController.getIncidents);

// Update Incident - Role logic in Service (HSE/ADMIN for priority/assignment)
router.put('/:id', hseController.updateIncident);

// Trigger Manual Alert - HSE and ADMIN
router.post('/:id/alert', authorize('ADMIN', 'HSE'), hseController.triggerAlert);

module.exports = router;
