const crypto = require('crypto');

const { db, admin } = require('../../config/firebase.config');
const { hashPassword } = require('../../utils/bcrypt.util');
const { AppError } = require('../../utils/app-error.util');
const { sendUserCredentialsEmail } = require('../../utils/email.util');
const { getUserByEmail, getUserById, changePassword } = require('../auth/auth.service');
const {
  createUserSchema,
  listUsersQuerySchema,
  userIdParamSchema,
  updateUserSchema,
} = require('./user.model');

const USERS_COLLECTION = 'users';
const GROUPS_COLLECTION = 'groups';
const AUDIT_LOGS_COLLECTION = 'audit_logs';

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

const toIsoDate = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
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
  createdAt: toIsoDate(user.createdAt),
  updatedAt: toIsoDate(user.updatedAt),
  isActive: user.isActive !== false,
  groupIds: Array.isArray(user.groupIds) ? user.groupIds : [],
  createdBy: user.createdBy || null,
  updatedBy: user.updatedBy || null,
  deletedBy: user.deletedBy || null,
  deletedAt: toIsoDate(user.deletedAt),
});

const buildTemporaryPassword = () => {
  const randomPart = crypto.randomBytes(6).toString('base64url');
  return `Tmp!${randomPart}9aA`;
};

const writeAuditLog = async ({ actorUserId, action, targetType, targetId, metadata }) => {
  try {
    const docRef = db.collection(AUDIT_LOGS_COLLECTION).doc();

    await docRef.set({
      id: docRef.id,
      actorUserId,
      action,
      targetType,
      targetId,
      metadata: metadata || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('Failed to write audit log', {
      action,
      targetType,
      targetId,
      actorUserId,
      message: error.message,
    });
  }
};

const ensureUserExists = async (userId) => {
  const validatedParams = validate(userIdParamSchema, { id: userId });
  const user = await getUserById(validatedParams.id);

  if (!user || user.isActive === false) {
    throw new AppError('User not found', 404);
  }

  return user;
};

const createUser = async (payload, actor) => {
  const validatedPayload = validate(createUserSchema, payload);
  const existingUser = await getUserByEmail(validatedPayload.email);

  if (existingUser) {
    throw new AppError('A user with this email already exists', 400);
  }

  const temporaryPassword = buildTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const docRef = db.collection(USERS_COLLECTION).doc();

  const user = {
    id: docRef.id,
    nom: validatedPayload.nom,
    email: validatedPayload.email.toLowerCase(),
    passwordHash,
    role: validatedPayload.role,
    mustChangePassword: true,
    fcmToken: validatedPayload.fcmToken || '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    isActive: true,
    groupIds: [],
    createdBy: actor.userId,
    updatedBy: actor.userId,
    deletedAt: null,
    deletedBy: null,
  };

  await docRef.set(user);

  let emailNotification = {
    attempted: false,
    sent: false,
  };

  if (validatedPayload.sendEmail) {
    try {
      emailNotification = await sendUserCredentialsEmail({
        to: user.email,
        nom: user.nom,
        temporaryPassword,
        role: user.role,
      });
    } catch (error) {
      emailNotification = {
        attempted: true,
        sent: false,
        reason: error.message,
      };
    }
  }

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'USER_CREATED',
    targetType: 'user',
    targetId: user.id,
    metadata: {
      role: user.role,
      email: user.email,
      emailNotification,
    },
  });

  return {
    user: sanitizeUser({
      ...user,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    temporaryPassword,
    emailNotification,
  };
};

const listUsers = async (query) => {
  const validatedQuery = validate(listUsersQuerySchema, query);
  let firestoreQuery = db.collection(USERS_COLLECTION);

  if (!validatedQuery.includeInactive) {
    firestoreQuery = firestoreQuery.where('isActive', '==', true);
  }

  if (validatedQuery.role) {
    firestoreQuery = firestoreQuery.where('role', '==', validatedQuery.role);
  }

  const snapshot = await firestoreQuery.get();
  const normalizedSearch = validatedQuery.search.trim().toLowerCase();

  let users = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  if (normalizedSearch) {
    users = users.filter((user) => {
      const name = String(user.nom || '').toLowerCase();
      const email = String(user.email || '').toLowerCase();

      return name.includes(normalizedSearch) || email.includes(normalizedSearch);
    });
  }

  users.sort((left, right) => {
    const leftTime = left.createdAt?.toMillis?.() || 0;
    const rightTime = right.createdAt?.toMillis?.() || 0;
    return rightTime - leftTime;
  });

  const total = users.length;
  const startIndex = (validatedQuery.page - 1) * validatedQuery.limit;
  const paginatedUsers = users
    .slice(startIndex, startIndex + validatedQuery.limit)
    .map(sanitizeUser);

  return {
    items: paginatedUsers,
    pagination: {
      page: validatedQuery.page,
      limit: validatedQuery.limit,
      total,
      totalPages: Math.ceil(total / validatedQuery.limit) || 1,
    },
  };
};

const getUserDetails = async (userId) => sanitizeUser(await ensureUserExists(userId));

const updateUser = async (userId, payload, actor) => {
  validate(userIdParamSchema, { id: userId });
  const validatedPayload = validate(updateUserSchema, payload);
  const user = await ensureUserExists(userId);

  const updates = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: actor.userId,
  };

  if (validatedPayload.nom !== undefined) {
    updates.nom = validatedPayload.nom;
  }

  if (validatedPayload.role !== undefined) {
    updates.role = validatedPayload.role;
  }

  await db.collection(USERS_COLLECTION).doc(user.id).update(updates);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'USER_UPDATED',
    targetType: 'user',
    targetId: user.id,
    metadata: validatedPayload,
  });

  return sanitizeUser(await ensureUserExists(user.id));
};

const deleteUser = async (userId, actor) => {
  validate(userIdParamSchema, { id: userId });

  if (actor.userId === userId) {
    throw new AppError('You cannot delete your own account', 400);
  }

  const user = await ensureUserExists(userId);

  await db.collection(USERS_COLLECTION).doc(user.id).update({
    isActive: false,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    deletedBy: actor.userId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: actor.userId,
  });

  const groupsSnapshot = await db
    .collection(GROUPS_COLLECTION)
    .where('memberIds', 'array-contains', user.id)
    .get();

  await Promise.all(
    groupsSnapshot.docs.map((doc) =>
      doc.ref.update({
        memberIds: admin.firestore.FieldValue.arrayRemove(user.id),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: actor.userId,
      })
    )
  );

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'USER_DELETED',
    targetType: 'user',
    targetId: user.id,
    metadata: {
      email: user.email,
    },
  });

  return {
    message: 'User deactivated successfully',
  };
};

const updateOwnPassword = async (userId, payload, metadata) =>
  changePassword(userId, payload, metadata);

module.exports = {
  sanitizeUser,
  createUser,
  listUsers,
  getUserDetails,
  updateUser,
  deleteUser,
  updateOwnPassword,
  writeAuditLog,
};
