const { db, admin } = require('../../config/firebase.config');
const { AppError } = require('../../utils/app-error.util');

const NOTIFICATIONS_COLLECTION = 'notifications';
const USERS_COLLECTION = 'users';

const toIsoDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
};

const sanitizeNotification = (n) => ({
  id: n.id,
  title: n.title,
  message: n.message,
  type: n.type,
  targetType: n.targetType,
  targetValue: n.targetValue,
  isRead: Boolean(n.isRead),
  createdAt: toIsoDate(n.createdAt),
});

/**
 * Send a notification to specific recipients
 */
const sendNotification = async (payload) => {
  const { title, message, type, targetType, targetValue } = payload;
  let recipientIds = [];

  if (targetType === 'USER') {
    recipientIds = [targetValue];
  } else if (targetType === 'ROLE') {
    const snapshot = await db.collection(USERS_COLLECTION).where('role', '==', targetValue).where('isActive', '==', true).get();
    recipientIds = snapshot.docs.map(doc => doc.id);
  } else if (targetType === 'ALL') {
    const snapshot = await db.collection(USERS_COLLECTION).where('isActive', '==', true).get();
    recipientIds = snapshot.docs.map(doc => doc.id);
  }

  if (recipientIds.length === 0) return;

  const batch = db.batch();
  
  recipientIds.forEach(userId => {
    const docRef = db.collection(NOTIFICATIONS_COLLECTION).doc();
    batch.set(docRef, {
      id: docRef.id,
      userId, // Owner of this notification copy
      title,
      message,
      type,
      targetType,
      targetValue,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
};

const listMyNotifications = async (userId) => {
  const snapshot = await db.collection(NOTIFICATIONS_COLLECTION)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  return snapshot.docs.map(doc => sanitizeNotification(doc.data()));
};

const listAllNotifications = async () => {
    const snapshot = await db.collection(NOTIFICATIONS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
  
    return snapshot.docs.map(doc => sanitizeNotification(doc.data()));
};

const markAsRead = async (notificationId, userId) => {
  const docRef = db.collection(NOTIFICATIONS_COLLECTION).doc(notificationId);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new AppError('Notification not found', 404);
  }

  const data = snapshot.data();
  if (data.userId !== userId) {
    throw new AppError('Unauthorized', 403);
  }

  await docRef.update({ 
      isRead: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return { id: notificationId, isRead: true };
};

module.exports = {
  sendNotification,
  listMyNotifications,
  listAllNotifications,
  markAsRead,
};
