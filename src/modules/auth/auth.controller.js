const authService = require('./auth.service');

const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const result = await authService.changePassword(req.user.userId, req.body, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  changePassword,
};
