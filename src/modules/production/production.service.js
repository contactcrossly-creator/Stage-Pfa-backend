const { db, admin } = require('../../config/firebase.config');
const { AppError } = require('../../utils/app-error.util');
const { writeAuditLog } = require('../user/user.service');
const notificationService = require('../notification/notification.service');
const {
  createProductionSchema,
  completeProductionSchema,
  productionIdParamSchema,
} = require('./production.model');

const PRODUCTIONS_COLLECTION = 'production_batches';
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

const sanitizeBatch = (b) => ({
  id: b.id,
  productId: b.productId,
  productName: b.productName || null,
  quantityPlanned: b.quantityPlanned,
  quantityProduced: b.quantityProduced || 0,
  status: b.status,
  startedAt: toIsoDate(b.startedAt),
  endedAt: toIsoDate(b.endedAt),
  createdBy: b.createdBy,
  createdAt: toIsoDate(b.createdAt),
});

const getBatchById = async (id) => {
  validate(productionIdParamSchema, { id });
  const snapshot = await db.collection(PRODUCTIONS_COLLECTION).doc(id).get();

  if (!snapshot.exists) {
    throw new AppError('Production batch not found', 404);
  }

  const batch = { id: snapshot.id, ...snapshot.data() };

  // Fetch product name
  const productSnapshot = await db.collection(PRODUCTS_COLLECTION).doc(batch.productId).get();
  if (productSnapshot.exists) {
    batch.productName = productSnapshot.data().name || null;
  }

  return batch;
};

const createProduction = async (payload, actor) => {
  const validatedPayload = validate(createProductionSchema, payload);

  // Validate product exists
  const productSnapshot = await db.collection(PRODUCTS_COLLECTION).doc(validatedPayload.productId).get();
  if (!productSnapshot.exists) {
    throw new AppError('Product not found', 404);
  }

  const docRef = db.collection(PRODUCTIONS_COLLECTION).doc();
  const batch = {
    id: docRef.id,
    productId: validatedPayload.productId,
    productName: productSnapshot.data().name || null,
    quantityPlanned: validatedPayload.quantityPlanned,
    quantityProduced: 0,
    status: 'PENDING',
    startedAt: null,
    endedAt: null,
    createdBy: actor.userId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await docRef.set(batch);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'PRODUCTION_CREATED',
    targetType: 'production',
    targetId: batch.id,
    metadata: { productId: batch.productId, quantityPlanned: batch.quantityPlanned },
  });

  return sanitizeBatch({ ...batch, createdAt: new Date() });
};

const listProductions = async () => {
  const snapshot = await db.collection(PRODUCTIONS_COLLECTION).orderBy('createdAt', 'desc').get();
  const batches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Fetch product names for all batches
  for (let batch of batches) {
    const productSnapshot = await db.collection(PRODUCTS_COLLECTION).doc(batch.productId).get();
    if (productSnapshot.exists) {
      batch.productName = productSnapshot.data().name || null;
    }
  }
  
  return batches.map(batch => sanitizeBatch(batch));
};

const startProduction = async (id, actor) => {
  const batch = await getBatchById(id);

  if (batch.status !== 'PENDING') {
    throw new AppError(`Cannot start production in ${batch.status} status`, 400);
  }

  await db.collection(PRODUCTIONS_COLLECTION).doc(id).update({
    status: 'RUNNING',
    productName: batch.productName,
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'PRODUCTION_STARTED',
    targetType: 'production',
    targetId: id,
  });

  return sanitizeBatch(await getBatchById(id));
};

const completeProduction = async (id, payload, actor) => {
  const validatedPayload = validate(completeProductionSchema, payload);
  const batchRef = db.collection(PRODUCTIONS_COLLECTION).doc(id);
  
  const batch = await getBatchById(id);
  if (batch.status !== 'RUNNING') {
    throw new AppError(`Cannot complete production in ${batch.status} status`, 400);
  }

  if (validatedPayload.quantityProduced > batch.quantityPlanned) {
    throw new AppError('Quantity produced cannot exceed planned quantity', 400);
  }

  const productRef = db.collection(PRODUCTS_COLLECTION).doc(batch.productId);
  const movementRef = db.collection(MOVEMENTS_COLLECTION).doc();

  await db.runTransaction(async (transaction) => {
    const productDoc = await transaction.get(productRef);
    if (!productDoc.exists) {
      throw new AppError('Product not found or deleted', 404);
    }

    const productData = productDoc.data();
    const newQuantity = (productData.quantity || 0) + validatedPayload.quantityProduced;

    // 1. Update Batch status
    transaction.update(batchRef, {
      status: 'COMPLETED',
      productName: batch.productName,
      quantityProduced: validatedPayload.quantityProduced,
      endedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2. record Stock Movement
    transaction.set(movementRef, {
      id: movementRef.id,
      productId: batch.productId,
      type: 'IN',
      quantity: validatedPayload.quantityProduced,
      reason: `Production Order #${batch.id}`,
      createdBy: actor.userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 3. Update Product quantity
    transaction.update(productRef, {
      quantity: newQuantity,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await notificationService.sendNotification({
    title: '✅ Production Completed',
    message: `Batch #${id} has been completed. Quantity: ${validatedPayload.quantityProduced}`,
    type: 'INFO',
    targetType: 'ROLE',
    targetValue: 'PRODUCTION',
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'PRODUCTION_COMPLETED',
    targetType: 'production',
    targetId: id,
    metadata: { quantityProduced: validatedPayload.quantityProduced },
  });

  return sanitizeBatch(await getBatchById(id));
};

const cancelProduction = async (id, actor) => {
  const batch = await getBatchById(id);

  if (batch.status === 'COMPLETED' || batch.status === 'CANCELLED') {
    throw new AppError(`Cannot cancel production in ${batch.status} status`, 400);
  }

  await db.collection(PRODUCTIONS_COLLECTION).doc(id).update({
    productName: batch.productName,
    status: 'CANCELLED',
    endedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'PRODUCTION_CANCELLED',
    targetType: 'production',
    targetId: id,
  });

  return sanitizeBatch(await getBatchById(id));
};

const getBatchByIdWithDetails = async (id) => {
  const batch = await getBatchById(id);
  return sanitizeBatch(batch);
};

module.exports = {
  createProduction,
  listProductions,
  getBatchById: getBatchByIdWithDetails,
  startProduction,
  completeProduction,
  cancelProduction,
};
