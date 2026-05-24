const { db, admin } = require('../../config/firebase.config');
const { AppError } = require('../../utils/app-error.util');
const { writeAuditLog } = require('../user/user.service');
const notificationService = require('../notification/notification.service');
const { generateQrDataUrl, generateQrBuffer } = require('../../utils/qr-code.util');
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

const resolveUsers = async (...userIds) => {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const snapshot = await db
    .collection('users')
    .where(admin.firestore.FieldPath.documentId(), 'in', uniqueIds)
    .get();

  const map = {};
  const foundIds = new Set();
  snapshot.docs.forEach((doc) => {
    map[doc.id] = { id: doc.id, nom: doc.data().nom };
    foundIds.add(doc.id);
  });

  const missingIds = uniqueIds.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    const fbSnapshot = await db
      .collection('users')
      .where('firebaseUid', 'in', missingIds)
      .get();
    fbSnapshot.docs.forEach((doc) => {
      map[doc.data().firebaseUid] = { id: doc.id, nom: doc.data().nom };
    });
  }

  return map;
};

const resolveProducts = async (...productIds) => {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const snapshot = await db
    .collection(PRODUCTS_COLLECTION)
    .where(admin.firestore.FieldPath.documentId(), 'in', uniqueIds)
    .get();

  const map = {};
  snapshot.docs.forEach((doc) => {
    map[doc.id] = { id: doc.id, name: doc.data().name };
  });
  return map;
};

const sanitizeBatch = (b) => ({
  id: b.id,
  productId: b.productId,
  quantityPlanned: b.quantityPlanned,
  quantityProduced: b.quantityProduced || 0,
  status: b.status,
  qrCode: b.qrCode || null,
  createdBy: b.createdBy,
  createdAt: toIsoDate(b.createdAt),
  startedAt: toIsoDate(b.startedAt),
  endedAt: toIsoDate(b.endedAt),
  updatedAt: toIsoDate(b.updatedAt),
});

const getBatchById = async (id) => {
  validate(productionIdParamSchema, { id });
  const snapshot = await db.collection(PRODUCTIONS_COLLECTION).doc(id).get();

  if (!snapshot.exists) {
    throw new AppError('Production batch not found', 404);
  }

  return { id: snapshot.id, ...snapshot.data() };
};

const enrichBatches = async (batches) => {
  if (!batches || batches.length === 0) return [];

  const productIds = batches.map((b) => b.productId).filter(Boolean);
  const userIds = batches.map((b) => b.createdBy).filter(Boolean);

  const [productMap, userMap] = await Promise.all([
    resolveProducts(...productIds),
    resolveUsers(...userIds),
  ]);

  const enriched = [...new Set(batches.map((b) => b.id))];
  const userMapForEnrich = userMap;
  const productMapForEnrich = productMap;

  const noneUser = (id) => ({ id, nom: 'Utilisateur supprimé' });
  const noneProduct = (id) => ({ id, name: 'Produit supprimé' });

  return batches.map((b) =>
    sanitizeBatch({
      ...b,
      productId: productMapForEnrich[b.productId] || noneProduct(b.productId),
      createdBy: userMapForEnrich[b.createdBy] || noneUser(b.createdBy),
    })
  );
};

const createProduction = async (payload, actor) => {
  const validatedPayload = validate(createProductionSchema, payload);

  const productSnapshot = await db.collection(PRODUCTS_COLLECTION).doc(validatedPayload.productId).get();
  if (!productSnapshot.exists) {
    throw new AppError('Product not found', 404);
  }

  const docRef = db.collection(PRODUCTIONS_COLLECTION).doc();
  const qrCode = await generateQrDataUrl("production", docRef.id, validatedPayload.productId);
  const batch = {
    id: docRef.id,
    productId: validatedPayload.productId,
    quantityPlanned: validatedPayload.quantityPlanned,
    quantityProduced: 0,
    status: 'PENDING',
    qrCode,
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

  const enriched = await enrichBatches([{ ...batch, createdAt: new Date() }]);
  return enriched[0];
};

const listProductions = async () => {
  const snapshot = await db.collection(PRODUCTIONS_COLLECTION).orderBy('createdAt', 'desc').get();
  const batches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return enrichBatches(batches);
};

const startProduction = async (id, actor) => {
  const batch = await getBatchById(id);

  if (batch.status !== 'PENDING') {
    throw new AppError(`Cannot start production in ${batch.status} status`, 400);
  }

  await db.collection(PRODUCTIONS_COLLECTION).doc(id).update({
    status: 'RUNNING',
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'PRODUCTION_STARTED',
    targetType: 'production',
    targetId: id,
  });

  const updated = await getBatchById(id);
  const enriched = await enrichBatches([updated]);
  return enriched[0];
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

    transaction.update(batchRef, {
      status: 'COMPLETED',
      quantityProduced: validatedPayload.quantityProduced,
      endedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    transaction.set(movementRef, {
      id: movementRef.id,
      productId: batch.productId,
      type: 'IN',
      quantity: validatedPayload.quantityProduced,
      reason: `Production Order #${batch.id}`,
      createdBy: actor.userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

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

  const updated = await getBatchById(id);
  const enriched = await enrichBatches([updated]);
  return enriched[0];
};

const cancelProduction = async (id, actor) => {
  const batch = await getBatchById(id);

  if (batch.status === 'COMPLETED' || batch.status === 'CANCELLED') {
    throw new AppError(`Cannot cancel production in ${batch.status} status`, 400);
  }

  await db.collection(PRODUCTIONS_COLLECTION).doc(id).update({
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

  const updated = await getBatchById(id);
  const enriched = await enrichBatches([updated]);
  return enriched[0];
};

const getBatchQrCode = async (id) => {
  const batch = await getBatchById(id);
  return generateQrBuffer("production", batch.id, batch.productId);
};

module.exports = {
  createProduction,
  listProductions,
  getBatchById: async (id) => {
    const batch = await getBatchById(id);
    const enriched = await enrichBatches([batch]);
    return enriched[0];
  },
  startProduction,
  completeProduction,
  cancelProduction,
  getBatchQrCode,
};
