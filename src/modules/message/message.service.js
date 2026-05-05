const { db, admin } = require("../../config/firebase.config");
const { AppError } = require("../../utils/app-error.util");
const { notifyMessageSchema } = require("./message.model");

const GROUPS_COLLECTION = "groups";
const USERS_COLLECTION = "users";
const NOTIFICATIONS_COLLECTION = "notifications";

const validate = (schema, payload) => {
  const { value, error } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    throw new AppError("Validation error", 400, {
      fields: error.details.map((d) => ({
        message: d.message,
        path: d.path.join("."),
      })),
    });
  }
  return value;
};

/**
 * Called by Flutter AFTER it has already written the message to Firestore.
 * This function:
 *   1. Validates membership
 *   2. Sends FCM push notifications to all group members except the sender
 *   3. Writes in-app notification records to Firestore
 */
const notifyGroupMembers = async (payload, actor) => {
  const { groupId, content } = validate(notifyMessageSchema, payload);

  // 1. Get group & validate membership
  const groupSnapshot = await db
    .collection(GROUPS_COLLECTION)
    .doc(groupId)
    .get();
  if (!groupSnapshot.exists) {
    throw new AppError("Group not found", 404);
  }
  const group = { id: groupSnapshot.id, ...groupSnapshot.data() };

  if (!group.members || !group.members.includes(actor.userId)) {
    throw new AppError("You are not a member of this group", 403);
  }

  // 2. Determine recipients (everyone except the sender)
  const recipientIds = (group.members || []).filter(
    (id) => id !== actor.userId,
  );
  if (recipientIds.length === 0) {
    return { sent: 0, fcmSent: 0 };
  }

  // 3. Fetch recipient user documents to get FCM tokens
  const userSnapshots = await Promise.all(
    recipientIds.map((id) => db.collection(USERS_COLLECTION).doc(id).get()),
  );

  const fcmTokens = userSnapshots
    .filter((snap) => snap.exists && snap.data().fcmToken)
    .map((snap) => snap.data().fcmToken);

  // 4. Send FCM multicast push notification
  let fcmSent = 0;
  if (fcmTokens.length > 0) {
    const preview =
      content.length > 80 ? `${content.substring(0, 80)}…` : content;
    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: fcmTokens,
        notification: {
          title: `💬 ${group.name}`,
          body: preview,
        },
        data: {
          type: "NEW_MESSAGE",
          groupId,
          groupName: group.name,
        },
        android: {
          priority: "high",
        },
        apns: {
          payload: {
            aps: { sound: "default" },
          },
        },
      });
      fcmSent = response.successCount;
      if (response.failureCount > 0) {
        console.warn(
          `[notify] ${response.failureCount} FCM deliveries failed for group ${groupId}`,
        );
      }
    } catch (fcmError) {
      // FCM errors are non-fatal — in-app notifications still proceed
      console.error("[notify] FCM multicast error:", fcmError.message);
    }
  }

  // 5. Write in-app notification records (fan-out per recipient)
  const preview =
    content.length > 100 ? `${content.substring(0, 100)}…` : content;
  const batch = db.batch();
  recipientIds.forEach((userId) => {
    const docRef = db.collection(NOTIFICATIONS_COLLECTION).doc();
    batch.set(docRef, {
      id: docRef.id,
      userId,
      title: `💬 ${group.name}`,
      message: preview,
      type: "INFO",
      targetType: "USER",
      targetValue: userId,
      isRead: false,
      metadata: {
        groupId,
        groupName: group.name,
        senderId: actor.userId,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();

  return { sent: recipientIds.length, fcmSent };
};

module.exports = { notifyGroupMembers };
