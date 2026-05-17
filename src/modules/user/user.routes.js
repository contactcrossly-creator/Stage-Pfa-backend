const express = require('express');

const userController = require('./user.controller');
const {
  authenticate,
  requirePasswordChangeCompleted,
} = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const router = express.Router();

router.patch('/change-password', authenticate, userController.changePassword);
router.get('/me', authenticate, requirePasswordChangeCompleted, userController.getProfile);
router.get(
  '/admin-dashboard',
  authenticate,
  requirePasswordChangeCompleted,
  authorize('ADMIN'),
  userController.getAdminDashboard
);
router.post(
  '/',
  authenticate,
  requirePasswordChangeCompleted,
  authorize('ADMIN'),
  userController.createUser
);
router.get(
  '/',
  authenticate,
  requirePasswordChangeCompleted,
  userController.listUsers
);
router.get(
  '/firebase-uid/:firebaseUid',
  authenticate,
  requirePasswordChangeCompleted,
  userController.getUserByFirebaseUid
);
router.get(
  '/:id',
  authenticate,
  requirePasswordChangeCompleted,
  userController.getUserById
);
router.put(
  '/:id',
  authenticate,
  requirePasswordChangeCompleted,
  authorize('ADMIN'),
  userController.updateUser
);
router.delete(
  '/:id',
  authenticate,
  requirePasswordChangeCompleted,
  authorize('ADMIN'),
  userController.deleteUser
);

module.exports = router;
