const express = require('express');

const groupController = require('./group.controller');
const {
  authenticate,
  requirePasswordChangeCompleted,
} = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const router = express.Router();

// All routes require authentication and completed password change
router.use(authenticate, requirePasswordChangeCompleted);

// Create Group: Only ADMIN
router.post('/', authorize('ADMIN'), groupController.createGroup);

// List Groups: service handles filtering (ADMIN gets all, others get their groups)
router.get('/', groupController.getGroups);

// Get Group by ID
router.get('/:id', groupController.getGroup);

// Update Group: service handles (ADMIN or Creator)
router.put('/:id', groupController.updateGroup);

// Delete Group: Only ADMIN
router.delete('/:id', authorize('ADMIN'), groupController.deleteGroup);

// Add Members: service handles (ADMIN or Creator)
router.post('/:id/members', groupController.addMembers);

// Remove Member: service handles (ADMIN or Creator)
router.delete('/:id/members/:userId', groupController.removeMember);

module.exports = router;
