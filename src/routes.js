const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'API is running' });
});

router.use('/auth', require('./modules/auth/auth.routes'));
router.use('/users', require('./modules/user/user.routes'));
router.use('/groups', require('./modules/group/group.routes'));

module.exports = router;
