const { AppError } = require('../utils/app-error.util');

const notFoundHandler = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

const errorHandler = (error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  const isOperational = error instanceof AppError || statusCode < 500;

  if (!isOperational) {
    console.error('Unhandled error', {
      message: error.message,
      stack: error.stack,
      path: req.originalUrl,
      method: req.method,
    });
  }

  const response = {
    message:
      statusCode >= 500 && !isOperational
        ? 'Internal server error'
        : error.message || 'Unexpected error',
  };

  if (error.details) {
    response.details = error.details;
  }

  res.status(statusCode).json(response);
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
