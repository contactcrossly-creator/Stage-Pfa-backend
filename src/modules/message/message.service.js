const { db, admin } = require('../../config/firebase.config');
const { AppError } = require('../../utils/app-error.util');
const groupService = require('../group/group.service');
const { sendMessageSchema, listMessagesQuerySchema } = require('./message.model');

const MESSAGES_COLLECTION = 'messages';

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
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
};

const sanitizeMessage = (msg) => ({
  id: msg.id,
  content: msg.content,
  senderId: msg.senderId,
  groupId: msg.groupId,
  createdAt: toIsoDate(msg.createdAt),
});

const sendMessage = async (payload, actor) => {
  const validatedPayload = validate(sendMessageSchema, payload);

  // Validate group exists and user is a member
  const group = await groupService.getGroupById(validatedPayload.groupId);
  
  if (!group.members.includes(actor.userId)) {
    throw new AppError('You are not a member of this group', 403);
  }

  const docRef = db.collection(MESSAGES_COLLECTION).doc();
  const message = {
    id: docRef.id,
    content: validatedPayload.content,
    senderId: actor.userId,
    groupId: validatedPayload.groupId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await docRef.set(message);

  return sanitizeMessage({
    ...message,
    createdAt: new Date(),
  });
};

const listMessages = async (query, actor) => {
  const validatedQuery = validate(listMessagesQuerySchema, query);

  // Validate group exists and access permission
  const group = await groupService.getGroupById(validatedQuery.groupId);
  
  if (actor.role !== 'ADMIN' && !group.members.includes(actor.userId)) {
    throw new AppError('Access denied: You are not a member of this group', 403);
  }

  let firestoreQuery = db.collection(MESSAGES_COLLECTION)
    .where('groupId', '==', validatedQuery.groupId)
    .orderBy('createdAt', 'desc');

  // Basic pagination logic using standard offset/limit for simplicity 
  // (In Firestore, startAfter is better, but this follows the user's "page/limit" req)
  const snapshot = await firestoreQuery.get();
  const allMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const total = allMessages.length;
  const startIndex = (validatedQuery.page - 1) * validatedQuery.limit;
  const paginatedMessages = allMessages
    .slice(startIndex, startIndex + validatedQuery.limit)
    .map(sanitizeMessage);

  return {
    items: paginatedMessages,
    pagination: {
      page: validatedQuery.page,
      limit: validatedQuery.limit,
      total,
      totalPages: Math.ceil(total / validatedQuery.limit) || 1,
    },
  };
};

module.exports = {
  sendMessage,
  listMessages,
};
