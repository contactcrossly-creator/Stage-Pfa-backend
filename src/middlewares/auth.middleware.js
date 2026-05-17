const { verifyToken } = require('../utils/jwt.util');
const { AppError } = require('../utils/app-error.util');
const { getUserById } = require('../modules/auth/auth.service');

const extractBearerToken = (authorizationHeader) => {
  if (!authorizationHeader) {
    throw new AppError('Authorization token is required', 401);
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError('Invalid authorization header format', 401);
  }

  return token;
};

const authenticate = async (req, res, next) => {
  try {
    const token = extractBearerToken(req.headers.authorization || (req.query.token ? `Bearer ${req.query.token}` : null));
    const payload = verifyToken(token);
    const user = await getUserById(payload.userId);

    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    if (user.isActive === false) {
      throw new AppError('Unauthorized', 401);
    }

    req.user = {
      userId: user.id,
      role: user.role,
      email: user.email,
      nom: user.nom,
      mustChangePassword: Boolean(user.mustChangePassword),
      fcmToken: user.fcmToken || null,
      isActive: user.isActive !== false,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

const requirePasswordChangeCompleted = (req, res, next) => {
  if (req.user?.mustChangePassword) {
    return next(
      new AppError('Password update required before accessing this resource', 403, {
        code: 'PASSWORD_CHANGE_REQUIRED',
      })
    );
  }

  return next();
};

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const loginAttemptStore = new Map();

const cleanupRateLimitBucket = (key, now) => {
  const bucket = loginAttemptStore.get(key);

  if (!bucket) {
    return null;
  }

  if (bucket.resetAt <= now) {
    loginAttemptStore.delete(key);
    return null;
  }

  return bucket;
};

const loginRateLimiter = (req, res, next) => {
  const identifier = `${req.ip || 'unknown'}:${String(req.body?.email || '').toLowerCase()}`;
  const now = Date.now();
  let bucket = cleanupRateLimitBucket(identifier, now);

  if (!bucket) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    loginAttemptStore.set(identifier, bucket);
  }

  bucket.count += 1;

  if (bucket.count > MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfterSeconds));

    return next(
      new AppError('Too many login attempts. Please try again later.', 429, {
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds,
      })
    );
  }

  return next();
};

module.exports = {
  authenticate,
  requirePasswordChangeCompleted,
  loginRateLimiter,
};
