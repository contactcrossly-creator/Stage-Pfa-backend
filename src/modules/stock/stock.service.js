const { db, admin } = require('../../config/firebase.config');
const { AppError } = require('../../utils/app-error.util');
const { writeAuditLog } = require('../user/user.service');
const {
  createProductSchema,
  updateProductSchema,
  recordMovementSchema,
  productIdParamSchema,
  listMovementQuerySchema,
} = require('./stock.model');

const PRODUCTS_COLLECTION = 'products';
const MOVEMENTS_COLLECTION = 'stock_movements';

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

const sanitizeProduct = (p) => ({
  id: p.id,
  name: p.name,
  reference: p.reference || '',
  category: p.category || '',
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
  reason: m.reason || '',
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
    action: 'PRODUCT_CREATED',
    targetType: 'product',
    targetId: product.id,
    metadata: { name: product.name },
  });

  return sanitizeProduct({ ...product, createdAt: new Date(), updatedAt: new Date() });
};

const listProducts = async () => {
  const snapshot = await db.collection(PRODUCTS_COLLECTION).get();
  return snapshot.docs.map(doc => sanitizeProduct({ id: doc.id, ...doc.data() }));
};

const getProductById = async (id) => {
  validate(productIdParamSchema, { id });
  const snapshot = await db.collection(PRODUCTS_COLLECTION).doc(id).get();

  if (!snapshot.exists) {
    throw new AppError('Product not found', 404);
  }

  return sanitizeProduct({ id: snapshot.id, ...snapshot.data() });
};

const updateProduct = async (id, payload, actor) => {
  validate(productIdParamSchema, { id });
  const validatedPayload = validate(updateProductSchema, payload);

  const docRef = db.collection(PRODUCTS_COLLECTION).doc(id);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new AppError('Product not found', 404);
  }

  const updates = {
    ...validatedPayload,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: actor.userId,
  };

  await docRef.update(updates);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'PRODUCT_UPDATED',
    targetType: 'product',
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
    throw new AppError('Product not found', 404);
  }

  await docRef.delete();

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'PRODUCT_DELETED',
    targetType: 'product',
    targetId: id,
    metadata: { name: snapshot.data().name },
  });

  return { message: 'Product deleted successfully' };
};

// --- Stock Movement Services ---

const recordMovement = async (payload, actor) => {
  const validatedPayload = validate(recordMovementSchema, payload);
  const productRef = db.collection(PRODUCTS_COLLECTION).doc(validatedPayload.productId);
  const movementRef = db.collection(MOVEMENTS_COLLECTION).doc();

  let recordedMovement = null;

  await db.runTransaction(async (transaction) => {
    const productDoc = await transaction.get(productRef);
    if (!productDoc.exists) {
      throw new AppError('Product not found', 404);
    }

    const productData = productDoc.data();
    let newQuantity = productData.quantity || 0;

    if (validatedPayload.type === 'IN') {
      newQuantity += validatedPayload.quantity;
    } else {
      if (newQuantity < validatedPayload.quantity) {
        throw new AppError('Insufficient stock for this movement', 400);
      }
      newQuantity -= validatedPayload.quantity;
    }

    const movement = {
      id: movementRef.id,
      productId: validatedPayload.productId,
      type: validatedPayload.type,
      quantity: validatedPayload.quantity,
      reason: validatedPayload.reason || '',
      createdBy: actor.userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    transaction.update(productRef, {
      quantity: newQuantity,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    transaction.set(movementRef, movement);
    recordedMovement = { ...movement, createdAt: new Date() };
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: `STOCK_MOVEMENT_${validatedPayload.type}`,
    targetType: 'product',
    targetId: validatedPayload.productId,
    metadata: validatedPayload,
  });

  return sanitizeMovement(recordedMovement);
};

const listMovements = async (query) => {
  const validatedQuery = validate(listMovementQuerySchema, query);
  let firestoreQuery = db.collection(MOVEMENTS_COLLECTION).orderBy('createdAt', 'desc');

  if (validatedQuery.productId) {
    firestoreQuery = firestoreQuery.where('productId', '==', validatedQuery.productId);
  }

  const snapshot = await firestoreQuery.get();
  const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const startIndex = (validatedQuery.page - 1) * validatedQuery.limit;
  const paginated = all.slice(startIndex, startIndex + validatedQuery.limit).map(sanitizeMovement);

  return {
    items: paginated,
    pagination: {
      page: validatedQuery.page,
      limit: validatedQuery.limit,
      total: all.length,
      totalPages: Math.ceil(all.length / validatedQuery.limit) || 1,
    }
  };
};

const listAlerts = async () => {
  // Find products where quantity <= minThreshold
  // Note: Firestore doesn't support comparing two fields in one document directly in a query.
  // For production with many products, we might want a scheduled job or a separate "alerts" collection.
  // Here, we fetch and filter in memory for simplicity, or we can use a query if minThreshold was constant.
  const snapshot = await db.collection(PRODUCTS_COLLECTION).get();
  const alerts = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(p => p.quantity <= (p.minThreshold || 0))
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
