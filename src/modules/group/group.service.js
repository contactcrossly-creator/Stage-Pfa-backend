const { db, admin } = require('../../config/firebase.config');
const { AppError } = require('../../utils/app-error.util');
const { getUserById } = require('../auth/auth.service');
const { sanitizeUser, writeAuditLog } = require('../user/user.service');
const {
  createGroupSchema,
  assignUsersToGroupSchema,
  groupIdParamSchema,
} = require('./group.model');

const GROUPS_COLLECTION = 'groups';
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

const sanitizeGroup = (group) => ({
  id: group.id,
  name: group.name,
  memberIds: Array.isArray(group.memberIds) ? group.memberIds : [],
  createdAt: toIsoDate(group.createdAt),
  updatedAt: toIsoDate(group.updatedAt),
  createdBy: group.createdBy || null,
  updatedBy: group.updatedBy || null,
});

const getGroupById = async (groupId) => {
  const validatedParams = validate(groupIdParamSchema, { id: groupId });
  const snapshot = await db.collection(GROUPS_COLLECTION).doc(validatedParams.id).get();

  if (!snapshot.exists) {
    throw new AppError('Group not found', 404);
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
};

const createGroup = async (payload, actor) => {
  const validatedPayload = validate(createGroupSchema, payload);
  const existingSnapshot = await db
    .collection(GROUPS_COLLECTION)
    .where('name', '==', validatedPayload.name)
    .limit(1)
    .get();

  if (!existingSnapshot.empty) {
    throw new AppError('A group with this name already exists', 400);
  }

  const docRef = db.collection(GROUPS_COLLECTION).doc();
  const group = {
    id: docRef.id,
    name: validatedPayload.name,
    memberIds: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: actor.userId,
    updatedBy: actor.userId,
  };

  await docRef.set(group);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'GROUP_CREATED',
    targetType: 'group',
    targetId: group.id,
    metadata: {
      name: group.name,
    },
  });

  return sanitizeGroup({
    ...group,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
};

const listGroups = async () => {
  const snapshot = await db.collection(GROUPS_COLLECTION).get();
  const items = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(sanitizeGroup);

  return { items };
};

const assignUsersToGroup = async (groupId, payload, actor) => {
  const validatedPayload = validate(assignUsersToGroupSchema, payload);
  const group = await getGroupById(groupId);
  const uniqueUserIds = [...new Set(validatedPayload.userIds)];
  const users = [];

  for (const userId of uniqueUserIds) {
    const user = await getUserById(userId);

    if (!user || user.isActive === false) {
      throw new AppError(`User not found: ${userId}`, 404);
    }

    users.push(user);
  }

  await db.collection(GROUPS_COLLECTION).doc(group.id).update({
    memberIds: uniqueUserIds,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: actor.userId,
  });

  await Promise.all(
    users.map((user) =>
      db
        .collection(USERS_COLLECTION)
        .doc(user.id)
        .update({
          groupIds: admin.firestore.FieldValue.arrayUnion(group.id),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: actor.userId,
        })
    )
  );

  const previousMembers = Array.isArray(group.memberIds) ? group.memberIds : [];
  const removedUserIds = previousMembers.filter((memberId) => !uniqueUserIds.includes(memberId));

  await Promise.all(
    removedUserIds.map((userId) =>
      db.collection(USERS_COLLECTION).doc(userId).update({
        groupIds: admin.firestore.FieldValue.arrayRemove(group.id),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: actor.userId,
      })
    )
  );

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'GROUP_MEMBERS_UPDATED',
    targetType: 'group',
    targetId: group.id,
    metadata: {
      userIds: uniqueUserIds,
    },
  });

  return sanitizeGroup(await getGroupById(group.id));
};

const listUsersInGroup = async (groupId) => {
  const group = await getGroupById(groupId);
  const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];

  const members = await Promise.all(memberIds.map((userId) => getUserById(userId)));

  return {
    group: sanitizeGroup(group),
    users: members.filter(Boolean).filter((user) => user.isActive !== false).map(sanitizeUser),
  };
};

module.exports = {
  createGroup,
  listGroups,
  assignUsersToGroup,
  listUsersInGroup,
};
