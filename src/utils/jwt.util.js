const jwt = require('jsonwebtoken');
const { getEnv } = require('../config/env.config');
const { AppError } = require('./app-error.util');

const JWT_SECRET = getEnv('JWT_SECRET');
const JWT_EXPIRES_IN = getEnv('JWT_EXPIRES_IN', '7d');

const signToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new AppError('Invalid or expired token', 401);
  }
};

module.exports = {
  signToken,
  verifyToken,
};
