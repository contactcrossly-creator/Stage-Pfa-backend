const crypto = require('crypto');

const { db, admin } = require('../../config/firebase.config');
const { hashPassword } = require('../../utils/bcrypt.util');
const { AppError } = require('../../utils/app-error.util');
const { getUserByEmail, getUserById, changePassword } = require('../auth/auth.service');
const { createFirebaseUser } = require('../../services/firebase-auth.service');
const { sendUserCredentialsEmail } = require('../../utils/email.util');
const {
  createUserSchema,
  listUsersQuerySchema,
  userIdParamSchema,
  updateUserSchema,
} = require('./user.model');
const notificationService = require('../notification/notification.service');

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
  firebaseUid: user.firebaseUid || null,
  createdBy: user.createdBy || null,
  updatedBy: user.updatedBy || null,
  deletedBy: user.deletedBy || null,
  deletedAt: toIsoDate(user.deletedAt),
});

const buildTemporaryPassword = () => {
  const randomPart = crypto.randomBytes(6).toString('base64url');
  return `Tmp!${randomPart}9aA`;
};

const AUDIT_NOTIFICATION_MAP = {
  USER_CREATED:              { title: 'New User Created',              msg: (m, a) => `Created user "${m.email}" with role ${m.role} — by ${a}`, type: 'INFO' },
  USER_UPDATED:              { title: 'User Updated',                  msg: (m, a) => `Updated user profile${m.email ? ` (${m.email})` : ''} — by ${a}`, type: 'INFO' },
  USER_DELETED:              { title: 'User Deactivated',              msg: (m, a) => `Deactivated user "${m.email}" — by ${a}`, type: 'INFO' },
  PRODUCT_CREATED:           { title: 'New Product Added',             msg: (m, a) => `Added product "${m.name}" — by ${a}`, type: 'INFO' },
  PRODUCT_UPDATED:           { title: 'Product Updated',               msg: (m, a) => `Updated product${m.name ? ` "${m.name}"` : ''} — by ${a}`, type: 'INFO' },
  PRODUCT_DELETED:           { title: 'Product Removed',               msg: (m, a) => `Deleted product "${m.name}" — by ${a}`, type: 'INFO' },
  STOCK_MOVEMENT_IN:         { title: 'Stock Received',                msg: (m, a) => `Stock IN: ${m.quantity || 0} units added${m.productId ? ` (product: ${m.productId})` : ''} — by ${a}`, type: 'INFO' },
  STOCK_MOVEMENT_OUT:        { title: 'Stock Withdrawn',               msg: (m, a) => `Stock OUT: ${m.quantity || 0} units removed${m.productId ? ` (product: ${m.productId})` : ''} — by ${a}`, type: 'INFO' },
  PRODUCTION_CREATED:        { title: 'Production Planned',            msg: (m, a) => `Planned production batch for ${m.quantityPlanned} units${m.productId ? ` (product: ${m.productId})` : ''} — by ${a}`, type: 'INFO' },
  PRODUCTION_STARTED:        { title: 'Production Started',            msg: (m, a) => `Started production batch — by ${a}`, type: 'INFO' },
  PRODUCTION_COMPLETED:      { title: 'Production Complete',           msg: (m, a) => `Completed production batch — ${m.quantityProduced} units produced — by ${a}`, type: 'INFO' },
  PRODUCTION_CANCELLED:      { title: 'Production Cancelled',          msg: (m, a) => `Cancelled production batch — by ${a}`, type: 'INFO' },
  QUALITY_TEST_CREATED:      { title: 'Quality Test Created',          msg: (m, a) => `Created quality test for batch #${m.batchId} — by ${a}`, type: 'INFO' },
  QUALITY_TEST_PASSED:       { title: 'Quality Test Passed',           msg: (m, a) => `Quality test passed${m.batchId ? ` for batch #${m.batchId}` : ''} — by ${a}`, type: 'INFO' },
  QUALITY_TEST_FAILED:       { title: 'Quality Test Failed',           msg: (m, a) => `Quality test FAILED${m.batchId ? ` for batch #${m.batchId}` : ''}${m.notes ? ': ' + m.notes : ''} — by ${a}`, type: 'WARNING' },
  INCIDENT_REPORTED:         { title: 'Incident Reported',             msg: (m, a) => `Reported ${m.priority || ''} ${m.type || ''} incident — by ${a}`, type: 'ALERT' },
  INCIDENT_UPDATED:          { title: 'Incident Updated',              msg: (m, a) => `Updated incident${m.title ? ` "${m.title}"` : ''} — by ${a}`, type: 'INFO' },
  INCIDENT_ALERT_TRIGGERED:  { title: 'Incident Alert Triggered',      msg: (m, a) => `Triggered incident alert — by ${a}`, type: 'ALERT' },
  INCIDENT_DELETED:          { title: 'Incident Resolved',             msg: (m, a) => `Closed incident${m.title ? ` "${m.title}"` : ''} — by ${a}`, type: 'INFO' },
  GROUP_CREATED:             { title: 'New Group Created',             msg: (m, a) => `Created group "${m.name}" — by ${a}`, type: 'INFO' },
  GROUP_UPDATED:             { title: 'Group Updated',                 msg: (m, a) => `Updated group details — by ${a}`, type: 'INFO' },
  GROUP_DELETED:             { title: 'Group Removed',                 msg: (m, a) => `Deleted group "${m.name}" — by ${a}`, type: 'INFO' },
  GROUP_MEMBERS_ADDED:       { title: 'Members Added to Group',        msg: (m, a) => `Added ${m.addedUserIds?.length || 0} member(s) to group — by ${a}`, type: 'INFO' },
  GROUP_MEMBER_REMOVED:      { title: 'Member Removed from Group',     msg: (m, a) => `Removed a member from group — by ${a}`, type: 'INFO' },
};

const getAuditNotificationContent = (action, metadata, actorName) => {
  const entry = AUDIT_NOTIFICATION_MAP[action];
  if (!entry) {
    return { title: 'Action Performed', message: `Action: ${action} — by ${actorName}`, type: 'INFO' };
  }
  return { title: entry.title, message: entry.msg(metadata || {}, actorName), type: entry.type };
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

    const actorSnapshot = await db.collection(USERS_COLLECTION).doc(actorUserId).get();
    const actorData = actorSnapshot.data();
    const actorRole = actorData?.role;
    const actorName = actorData?.nom || actorUserId;

    if (actorRole && actorRole !== 'ADMIN') {
      const { title, message, type } = getAuditNotificationContent(action, metadata, actorName);
      await notificationService.sendNotification({ title, message, type, targetType: 'ROLE', targetValue: 'ADMIN' });
    }
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

  const firebaseUid = await createFirebaseUser({
    email: validatedPayload.email,
    password: temporaryPassword,
    displayName: validatedPayload.nom,
  });

  const docRef = db.collection(USERS_COLLECTION).doc();

  const user = {
    id: docRef.id,
    nom: validatedPayload.nom,
    email: validatedPayload.email.toLowerCase(),
    passwordHash,
    firebaseUid,
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

const deleteUser = async (userId, actor, options = {}) => {
  validate(userIdParamSchema, { id: userId });

  if (actor.userId === userId) {
    throw new AppError('You cannot delete your own account', 400);
  }

  const user = await ensureUserExists(userId);

  const groupsSnapshot = await db
    .collection(GROUPS_COLLECTION)
    .where('members', 'array-contains', user.id)
    .get();

  await Promise.all(
    groupsSnapshot.docs.map((doc) =>
      doc.ref.update({
        members: admin.firestore.FieldValue.arrayRemove(user.id),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: actor.userId,
      })
    )
  );

  if (options.permanent) {
    if (user.firebaseUid) {
      await admin.auth().deleteUser(user.firebaseUid);
    }
    await db.collection(USERS_COLLECTION).doc(user.id).delete();

    await writeAuditLog({
      actorUserId: actor.userId,
      action: 'USER_DELETED',
      targetType: 'user',
      targetId: user.id,
      metadata: { email: user.email, permanent: true },
    });

    return { message: 'User permanently deleted' };
  }

  await db.collection(USERS_COLLECTION).doc(user.id).update({
    isActive: false,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    deletedBy: actor.userId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: actor.userId,
  });

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

const getUserByName = async (name) => {
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .where('nom', '==', name)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new AppError('User not found', 404);
  }

  const doc = snapshot.docs[0];
  return sanitizeUser({ id: doc.id, ...doc.data() });
};

const getUserByFirebaseUid = async (firebaseUid) => {
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .where('firebaseUid', '==', firebaseUid)
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new AppError('User not found', 404);
  }

  const doc = snapshot.docs[0];
  return sanitizeUser({ id: doc.id, ...doc.data() });
};

const restoreUser = async (userId, actor) => {
  const validatedParams = validate(userIdParamSchema, { id: userId });
  const user = await getUserById(validatedParams.id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.isActive !== false) {
    throw new AppError('User is already active', 400);
  }

  await db.collection(USERS_COLLECTION).doc(user.id).update({
    isActive: true,
    deletedAt: null,
    deletedBy: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: actor.userId,
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'USER_UPDATED',
    targetType: 'user',
    targetId: user.id,
    metadata: { email: user.email, restored: true },
  });

  return sanitizeUser(await getUserById(user.id));
};

const updateOwnPassword = async (userId, payload, metadata) =>
  changePassword(userId, payload, metadata);

module.exports = {
  sanitizeUser,
  createUser,
  listUsers,
  getUserDetails,
  getUserByFirebaseUid,
  updateUser,
  deleteUser,
  updateOwnPassword,
  restoreUser,
  writeAuditLog,
};
