const { AppError } = require('../utils/app-error.util');

const authorize = (...allowedRoles) => {
  const allowed = new Set(allowedRoles);

  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401));
    }

    if (!allowed.has(req.user.role)) {
      return next(new AppError('Forbidden', 403));
    }

    return next();
  };
};

module.exports = {
  authorize,
};
