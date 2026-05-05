const { db, admin } = require("../../config/firebase.config");
const { AppError } = require("../../utils/app-error.util");
const { getUserById } = require("../auth/auth.service");
const { writeAuditLog } = require("../user/user.service");
const {
  createGroupSchema,
  updateGroupSchema,
  addMembersSchema,
  listGroupsQuerySchema,
  groupIdParamSchema,
} = require("./group.model");

const GROUPS_COLLECTION = "groups";
const USERS_COLLECTION = "users";

const validate = (schema, payload) => {
  const { value, error } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw new AppError("Validation error", 400, {
      fields: error.details.map((detail) => ({
        message: detail.message,
        path: detail.path.join("."),
      })),
    });
  }

  return value;
};

const toIsoDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
};

const sanitizeGroup = (group) => ({
  id: group.id,
  name: group.name,
  description: group.description || "",
  members: Array.isArray(group.members) ? group.members : [],
  createdBy: group.createdBy || null,
  createdAt: toIsoDate(group.createdAt),
  updatedAt: toIsoDate(group.updatedAt),
  lastMessage: group.lastMessage || null,
  lastMessageAt: toIsoDate(group.lastMessageAt),
});

/**
 * Validate if all user IDs exist in the system
 * @param {string[]} userIds
 */
const ensureUsersExist = async (userIds) => {
  if (!userIds || userIds.length === 0) return;

  const uniqueIds = [...new Set(userIds)];
  const snapshots = await Promise.all(
    uniqueIds.map((id) => db.collection(USERS_COLLECTION).doc(id).get()),
  );

  const missingIds = snapshots
    .filter(
      (snapshot) => !snapshot.exists || snapshot.data().isActive === false,
    )
    .map((snapshot, index) => uniqueIds[index]);

  if (missingIds.length > 0) {
    throw new AppError(
      `Users not found or inactive: ${missingIds.join(", ")}`,
      404,
    );
  }
};

const getGroupById = async (groupId) => {
  validate(groupIdParamSchema, { id: groupId });
  const snapshot = await db.collection(GROUPS_COLLECTION).doc(groupId).get();

  if (!snapshot.exists) {
    throw new AppError("Group not found", 404);
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
};

const createGroup = async (payload, actor) => {
  const validatedPayload = validate(createGroupSchema, payload);

  // Check if name is already taken
  const existingSnapshot = await db
    .collection(GROUPS_COLLECTION)
    .where("name", "==", validatedPayload.name)
    .limit(1)
    .get();

  if (!existingSnapshot.empty) {
    throw new AppError("A group with this name already exists", 400);
  }

  // Ensure all members exist
  await ensureUsersExist(validatedPayload.members);

  // Creator is automatically added to members
  const memberSet = new Set(validatedPayload.members || []);
  memberSet.add(actor.userId);
  const members = Array.from(memberSet);

  const docRef = db.collection(GROUPS_COLLECTION).doc();
  const group = {
    id: docRef.id,
    name: validatedPayload.name,
    description: validatedPayload.description || "",
    members: members,
    createdBy: actor.userId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessage: null,
    lastMessageAt: null,
  };

  await docRef.set(group);

  // Update users to include this group in their groupIds
  await Promise.all(
    members.map((userId) =>
      db
        .collection(USERS_COLLECTION)
        .doc(userId)
        .update({
          groupIds: admin.firestore.FieldValue.arrayUnion(group.id),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
    ),
  );

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "GROUP_CREATED",
    targetType: "group",
    targetId: group.id,
    metadata: { name: group.name },
  });

  return sanitizeGroup({
    ...group,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
};

const listGroups = async (query, actor) => {
  const validatedQuery = validate(listGroupsQuerySchema, query);
  let firestoreQuery = db.collection(GROUPS_COLLECTION);

  // If not ADMIN, only return groups where user is a member
  if (actor.role !== "ADMIN") {
    firestoreQuery = firestoreQuery.where(
      "members",
      "array-contains",
      actor.userId,
    );
  }

  const snapshot = await firestoreQuery.get();
  let groups = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  // Sort by name
  groups.sort((a, b) => a.name.localeCompare(b.name));

  const total = groups.length;
  const startIndex = (validatedQuery.page - 1) * validatedQuery.limit;
  const paginatedGroups = groups
    .slice(startIndex, startIndex + validatedQuery.limit)
    .map(sanitizeGroup);

  return {
    items: paginatedGroups,
    pagination: {
      page: validatedQuery.page,
      limit: validatedQuery.limit,
      total,
      totalPages: Math.ceil(total / validatedQuery.limit) || 1,
    },
  };
};

const updateGroup = async (groupId, payload, actor) => {
  const validatedPayload = validate(updateGroupSchema, payload);
  const group = await getGroupById(groupId);

  // Permission check: Only ADMIN or creator
  if (actor.role !== "ADMIN" && group.createdBy !== actor.userId) {
    throw new AppError("Unauthorized to update this group", 403);
  }

  const updates = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (validatedPayload.name) updates.name = validatedPayload.name;
  if (validatedPayload.description !== undefined)
    updates.description = validatedPayload.description;

  if (validatedPayload.members) {
    if (validatedPayload.members.length === 0) {
      throw new AppError("Group must have at least one member", 400);
    }
    await ensureUsersExist(validatedPayload.members);

    const previousMembers = group.members || [];
    const newMembers = [...new Set(validatedPayload.members)];

    // Sync users' groupIds
    const addedMembers = newMembers.filter((m) => !previousMembers.includes(m));
    const removedMembers = previousMembers.filter(
      (m) => !newMembers.includes(m),
    );

    await Promise.all([
      ...addedMembers.map((userId) =>
        db
          .collection(USERS_COLLECTION)
          .doc(userId)
          .update({
            groupIds: admin.firestore.FieldValue.arrayUnion(group.id),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }),
      ),
      ...removedMembers.map((userId) =>
        db
          .collection(USERS_COLLECTION)
          .doc(userId)
          .update({
            groupIds: admin.firestore.FieldValue.arrayRemove(group.id),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }),
      ),
    ]);

    updates.members = newMembers;
  }

  await db.collection(GROUPS_COLLECTION).doc(group.id).update(updates);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "GROUP_UPDATED",
    targetType: "group",
    targetId: group.id,
    metadata: validatedPayload,
  });

  const updatedGroup = await getGroupById(group.id);
  return sanitizeGroup(updatedGroup);
};

const deleteGroup = async (groupId, actor) => {
  const group = await getGroupById(groupId);

  // Permission check: Only ADMIN (enforced by route, but safety first)
  if (actor.role !== "ADMIN") {
    throw new AppError("Only ADMIN can delete groups", 403);
  }

  // Remove group ID from all members' groupIds
  const members = group.members || [];
  await Promise.all(
    members.map((userId) =>
      db
        .collection(USERS_COLLECTION)
        .doc(userId)
        .update({
          groupIds: admin.firestore.FieldValue.arrayRemove(group.id),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
    ),
  );

  await db.collection(GROUPS_COLLECTION).doc(group.id).delete();

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "GROUP_DELETED",
    targetType: "group",
    targetId: group.id,
    metadata: { name: group.name },
  });

  return { message: "Group deleted successfully" };
};

const addMembers = async (groupId, payload, actor) => {
  const validatedPayload = validate(addMembersSchema, payload);
  const group = await getGroupById(groupId);

  // Permission check: Only ADMIN or creator
  if (actor.role !== "ADMIN" && group.createdBy !== actor.userId) {
    throw new AppError("Unauthorized to add members to this group", 403);
  }

  await ensureUsersExist(validatedPayload.userIds);

  const currentMembers = new Set(group.members || []);
  const usersToAdd = validatedPayload.userIds.filter(
    (id) => !currentMembers.has(id),
  );

  if (usersToAdd.length === 0) {
    return sanitizeGroup(group);
  }

  const updatedMembers = [...currentMembers, ...usersToAdd];

  await db.collection(GROUPS_COLLECTION).doc(group.id).update({
    members: updatedMembers,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await Promise.all(
    usersToAdd.map((userId) =>
      db
        .collection(USERS_COLLECTION)
        .doc(userId)
        .update({
          groupIds: admin.firestore.FieldValue.arrayUnion(group.id),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
    ),
  );

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "GROUP_MEMBERS_ADDED",
    targetType: "group",
    targetId: group.id,
    metadata: { addedUserIds: usersToAdd },
  });

  const updatedGroup = await getGroupById(group.id);
  return sanitizeGroup(updatedGroup);
};

const removeMember = async (groupId, userId, actor) => {
  const group = await getGroupById(groupId);

  // Permission check: Only ADMIN or creator
  if (actor.role !== "ADMIN" && group.createdBy !== actor.userId) {
    throw new AppError("Unauthorized to remove members from this group", 403);
  }

  const currentMembers = group.members || [];
  if (!currentMembers.includes(userId)) {
    throw new AppError("User is not a member of this group", 400);
  }

  if (currentMembers.length <= 1) {
    throw new AppError("Cannot remove the last member of the group", 400);
  }

  const updatedMembers = currentMembers.filter((id) => id !== userId);

  await db.collection(GROUPS_COLLECTION).doc(group.id).update({
    members: updatedMembers,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db
    .collection(USERS_COLLECTION)
    .doc(userId)
    .update({
      groupIds: admin.firestore.FieldValue.arrayRemove(group.id),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "GROUP_MEMBER_REMOVED",
    targetType: "group",
    targetId: group.id,
    metadata: { removedUserId: userId },
  });

  const updatedGroup = await getGroupById(group.id);
  return sanitizeGroup(updatedGroup);
};

module.exports = {
  createGroup,
  listGroups,
  getGroupById: async (id) => sanitizeGroup(await getGroupById(id)),
  updateGroup,
  deleteGroup,
  addMembers,
  removeMember,
};
