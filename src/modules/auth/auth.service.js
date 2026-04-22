const { db, admin } = require('../../config/firebase.config');
const { hashPassword, comparePassword } = require('../../utils/bcrypt.util');
const { signToken } = require('../../utils/jwt.util');
const { AppError } = require('../../utils/app-error.util');
const {
  loginSchema,
  changePasswordSchema,
  seedAdminSchema,
} = require('./auth.model');

const USERS_COLLECTION = 'users';

const validate = (schema, payload) => {
  const { value, error } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw new AppError('Validation error', 400, {
      fields: error.details.map((detail) => ({
        message: detail.message,
        path: detail.path.join('.'),
      })),
    });
  }

  return value;
};

const sanitizeUser = (user) => ({
  id: user.id,
  nom: user.nom,
  email: user.email,
  role: user.role,
  mustChangePassword: Boolean(user.mustChangePassword),
  fcmToken: user.fcmToken || '',
  createdAt: user.createdAt || null,
});

const logAuthAttempt = ({ action, email, status, ip, userAgent, reason }) => {
  console.info('[auth]', {
    action,
    email,
    status,
    ip: ip || 'unknown',
    userAgent: userAgent || 'unknown',
    reason: reason || null,
    timestamp: new Date().toISOString(),
  });
};

const getUserById = async (userId) => {
  const snapshot = await db.collection(USERS_COLLECTION).doc(userId).get();

  if (!snapshot.exists) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
};

const getUserByEmail = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .where('email', '==', normalizedEmail)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];

  return {
    id: doc.id,
    ...doc.data(),
  };
};

const login = async (payload, metadata = {}) => {
  const validatedPayload = validate(loginSchema, payload);
  const normalizedEmail = validatedPayload.email.toLowerCase();
  const user = await getUserByEmail(normalizedEmail);

  if (!user) {
    logAuthAttempt({
      action: 'login',
      email: normalizedEmail,
      status: 'failed',
      reason: 'user_not_found',
      ...metadata,
    });
    throw new AppError('Invalid email or password', 401);
  }

  const passwordMatches = await comparePassword(
    validatedPayload.password,
    user.passwordHash
  );

  if (!passwordMatches) {
    logAuthAttempt({
      action: 'login',
      email: normalizedEmail,
      status: 'failed',
      reason: 'invalid_password',
      ...metadata,
    });
    throw new AppError('Invalid email or password', 401);
  }

  const token = signToken({
    userId: user.id,
    role: user.role,
  });

  logAuthAttempt({
    action: 'login',
    email: normalizedEmail,
    status: 'success',
    reason: user.mustChangePassword ? 'password_change_required' : null,
    ...metadata,
  });

  return {
    token,
    user: sanitizeUser(user),
  };
};

const changePassword = async (userId, payload, metadata = {}) => {
  const validatedPayload = validate(changePasswordSchema, payload);
  const user = await getUserById(userId);

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const currentPasswordMatches = await comparePassword(
    validatedPayload.currentPassword,
    user.passwordHash
  );

  if (!currentPasswordMatches) {
    logAuthAttempt({
      action: 'change_password',
      email: user.email,
      status: 'failed',
      reason: 'invalid_current_password',
      ...metadata,
    });
    throw new AppError('Current password is incorrect', 401);
  }

  const samePassword = await comparePassword(
    validatedPayload.newPassword,
    user.passwordHash
  );

  if (samePassword) {
    throw new AppError('New password must be different from current password', 400);
  }

  const nextPasswordHash = await hashPassword(validatedPayload.newPassword);

  await db.collection(USERS_COLLECTION).doc(user.id).update({
    passwordHash: nextPasswordHash,
    mustChangePassword: false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logAuthAttempt({
    action: 'change_password',
    email: user.email,
    status: 'success',
    ...metadata,
  });

  const updatedUser = await getUserById(user.id);

  return {
    message: 'Password updated successfully',
    user: sanitizeUser(updatedUser),
  };
};

const createInitialAdmin = async (payload) => {
  const validatedPayload = validate(seedAdminSchema, {
    ...payload,
    role: 'ADMIN',
  });
  const existingUser = await getUserByEmail(validatedPayload.email);

  if (existingUser) {
    throw new AppError('A user with this email already exists', 400);
  }

  const passwordHash = await hashPassword(validatedPayload.password);
  const docRef = db.collection(USERS_COLLECTION).doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const user = {
    id: docRef.id,
    nom: validatedPayload.nom,
    email: validatedPayload.email.toLowerCase(),
    passwordHash,
    role: 'ADMIN',
    mustChangePassword: validatedPayload.mustChangePassword,
    fcmToken: validatedPayload.fcmToken || '',
    createdAt: now,
  };

  await docRef.set(user);

  return sanitizeUser({
    ...user,
    createdAt: new Date().toISOString(),
  });
};

module.exports = {
  login,
  changePassword,
  getUserById,
  getUserByEmail,
  createInitialAdmin,
};
