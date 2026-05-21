const { db, admin } = require("../../config/firebase.config");
const { AppError } = require("../../utils/app-error.util");
const { writeAuditLog } = require("../user/user.service");
const notificationService = require("../notification/notification.service");
const {
  createProductSchema,
  updateProductSchema,
  recordMovementSchema,
  productIdParamSchema,
  listMovementQuerySchema,
} = require("./stock.model");

const PRODUCTS_COLLECTION = "products";
const MOVEMENTS_COLLECTION = "stock_movements";
const PRODUCTIONS_COLLECTION = "production_batches";
const QUALITY_TESTS_COLLECTION = "quality_tests";
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

const sanitizeProduct = (p) => ({
  id: p.id,
  name: p.name,
  reference: p.reference || "",
  category: p.category || "",
  description: p.description || "",
  price: typeof p.price === "number" ? p.price : 0,
  quantity: p.quantity || 0,
  minThreshold: p.minThreshold || 0,
  createdAt: toIsoDate(p.createdAt),
  updatedAt: toIsoDate(p.updatedAt),
});

const sanitizeMovement = (m) => ({
  id: m.id,
  productId: m.productId,
  type: m.type,
  quantity: m.quantity,
  reason: m.reason || "",
  createdBy: m.createdBy,
  createdAt: toIsoDate(m.createdAt),
});

// --- Product Services ---

const createProduct = async (payload, actor) => {
  const validatedPayload = validate(createProductSchema, payload);

  const docRef = db.collection(PRODUCTS_COLLECTION).doc();
  const product = {
    id: docRef.id,
    ...validatedPayload,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: actor.userId,
  };

  await docRef.set(product);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "PRODUCT_CREATED",
    targetType: "product",
    targetId: product.id,
    metadata: { name: product.name },
  });

  return sanitizeProduct({
    ...product,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
};

const listProducts = async () => {
  const snapshot = await db.collection(PRODUCTS_COLLECTION).get();
  return snapshot.docs.map((doc) =>
    sanitizeProduct({ id: doc.id, ...doc.data() }),
  );
};

const getProductById = async (id) => {
  validate(productIdParamSchema, { id });
  const snapshot = await db.collection(PRODUCTS_COLLECTION).doc(id).get();

  if (!snapshot.exists) {
    throw new AppError("Product not found", 404);
  }

  return sanitizeProduct({ id: snapshot.id, ...snapshot.data() });
};

const updateProduct = async (id, payload, actor) => {
  validate(productIdParamSchema, { id });
  const validatedPayload = validate(updateProductSchema, payload);

  const docRef = db.collection(PRODUCTS_COLLECTION).doc(id);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new AppError("Product not found", 404);
  }

  const updates = {
    ...validatedPayload,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: actor.userId,
  };

  await docRef.update(updates);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "PRODUCT_UPDATED",
    targetType: "product",
    targetId: id,
    metadata: validatedPayload,
  });

  const updated = await docRef.get();
  return sanitizeProduct({ id: updated.id, ...updated.data() });
};

const deleteProduct = async (id, actor) => {
  validate(productIdParamSchema, { id });
  const docRef = db.collection(PRODUCTS_COLLECTION).doc(id);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new AppError("Product not found", 404);
  }

  const batch = db.batch();
  batch.delete(docRef);

  const batchesSnapshot = await db
    .collection(PRODUCTIONS_COLLECTION)
    .where("productId", "==", id)
    .get();

  for (const batchDoc of batchesSnapshot.docs) {
    const testsSnapshot = await db
      .collection(QUALITY_TESTS_COLLECTION)
      .where("batchId", "==", batchDoc.id)
      .get();
    testsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(batchDoc.ref);
  }

  const movementsSnapshot = await db
    .collection(MOVEMENTS_COLLECTION)
    .where("productId", "==", id)
    .get();
  movementsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));

  await batch.commit();

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "PRODUCT_DELETED",
    targetType: "product",
    targetId: id,
    metadata: { name: snapshot.data().name },
  });

  return { message: "Product deleted successfully" };
};

// --- Stock Movement Services ---

const recordMovement = async (payload, actor) => {
  const validatedPayload = validate(recordMovementSchema, payload);
  const productRef = db
    .collection(PRODUCTS_COLLECTION)
    .doc(validatedPayload.productId);
  const movementRef = db.collection(MOVEMENTS_COLLECTION).doc();

  let recordedMovement = null;

  await db.runTransaction(async (transaction) => {
    const productDoc = await transaction.get(productRef);
    if (!productDoc.exists) {
      throw new AppError("Product not found", 404);
    }

    const productData = productDoc.data();
    let newQuantity = productData.quantity || 0;

    if (validatedPayload.type === "IN") {
      newQuantity += validatedPayload.quantity;
    } else {
      if (newQuantity < validatedPayload.quantity) {
        throw new AppError("Insufficient stock for this movement", 400);
      }
      newQuantity -= validatedPayload.quantity;
    }

    const movement = {
      id: movementRef.id,
      productId: validatedPayload.productId,
      type: validatedPayload.type,
      quantity: validatedPayload.quantity,
      reason: validatedPayload.reason || "",
      createdBy: actor.userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    transaction.update(productRef, {
      quantity: newQuantity,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    transaction.set(movementRef, movement);
    recordedMovement = { ...movement, createdAt: new Date() };

    if (newQuantity <= (productData.minThreshold || 0)) {
      // We'll perform notification AFTER transaction commit to avoid lock or just do it here if it's safe.
      // Actually, sendNotification is async and outside the transaction logic is better.
    }
  });

  const productAfter = await productRef.get();
  const dataAfter = productAfter.data();
  if (dataAfter.quantity <= (dataAfter.minThreshold || 0)) {
    await notificationService.sendNotification({
      title: "📉 LOW STOCK ALERT",
      message: `Product ${dataAfter.name} is below minimum threshold (${dataAfter.quantity}/${dataAfter.minThreshold})`,
      type: "ALERT",
      targetType: "ROLE",
      targetValue: "STOCK",
    });

    try {
      const usersSnapshot = await db
        .collection(USERS_COLLECTION)
        .where("role", "in", ["STOCK", "ADMIN"])
        .where("isActive", "==", true)
        .get();

      const tokens = usersSnapshot.docs
        .map((doc) => doc.data().fcmToken)
        .filter((token) => typeof token === "string" && token.length > 0);

      if (tokens.length > 0) {
        await admin.messaging().sendEachForMulticast({
          tokens,
          notification: {
            title: `⚠️ Stock Bas — ${dataAfter.name}`,
            body: `Quantité actuelle : ${dataAfter.quantity} (seuil : ${dataAfter.minThreshold})`,
          },
        });
      }
    } catch (fcmError) {
      console.error(
        "[FCM] Failed to send low-stock push notification:",
        fcmError,
      );
    }
  }

  await writeAuditLog({
    actorUserId: actor.userId,
    action: `STOCK_MOVEMENT_${validatedPayload.type}`,
    targetType: "product",
    targetId: validatedPayload.productId,
    metadata: validatedPayload,
  });

  return sanitizeMovement(recordedMovement);
};

const listMovements = async (query) => {
  const validatedQuery = validate(listMovementQuerySchema, query);
  let firestoreQuery = db
    .collection(MOVEMENTS_COLLECTION)
    .orderBy("createdAt", "desc");

  if (validatedQuery.productId) {
    firestoreQuery = firestoreQuery.where(
      "productId",
      "==",
      validatedQuery.productId,
    );
  }

  const snapshot = await firestoreQuery.get();
  const all = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const startIndex = (validatedQuery.page - 1) * validatedQuery.limit;
  const paginated = all
    .slice(startIndex, startIndex + validatedQuery.limit)
    .map(sanitizeMovement);

  return {
    items: paginated,
    pagination: {
      page: validatedQuery.page,
      limit: validatedQuery.limit,
      total: all.length,
      totalPages: Math.ceil(all.length / validatedQuery.limit) || 1,
    },
  };
};

const listAlerts = async () => {
  // Find products where quantity <= minThreshold
  // Note: Firestore doesn't support comparing two fields in one document directly in a query.
  // For production with many products, we might want a scheduled job or a separate "alerts" collection.
  // Here, we fetch and filter in memory for simplicity, or we can use a query if minThreshold was constant.
  const snapshot = await db.collection(PRODUCTS_COLLECTION).get();
  const alerts = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((p) => p.quantity <= (p.minThreshold || 0))
    .map(sanitizeProduct);

  return { items: alerts, total: alerts.length };
};

module.exports = {
  createProduct,
  listProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  recordMovement,
  listMovements,
  listAlerts,
};
