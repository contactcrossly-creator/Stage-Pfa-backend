const express = require('express');

const groupController = require('./group.controller');
const {
  authenticate,
  requirePasswordChangeCompleted,
} = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const router = express.Router();

router.use(authenticate, requirePasswordChangeCompleted, authorize('ADMIN'));

router.post('/', groupController.createGroup);
router.get('/', groupController.listGroups);
router.put('/:id/users', groupController.assignUsers);
router.get('/:id/users', groupController.listUsersInGroup);

module.exports = router;
