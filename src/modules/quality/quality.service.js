const { db, admin } = require('../../config/firebase.config');
const { AppError } = require('../../utils/app-error.util');
const { writeAuditLog } = require('../user/user.service');
const notificationService = require('../notification/notification.service');
const qualityReportService = require('./quality-report.service');
const {
  createQualityTestSchema,
  updateQualityTestSchema,
  testIdParamSchema,
  listTestsQuerySchema,
} = require('./quality.model');

const QUALITY_TESTS_COLLECTION = 'quality_tests';
const PRODUCTIONS_COLLECTION = 'production_batches';
const USERS_COLLECTION = 'users';
const PRODUCTS_COLLECTION = 'products';

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
    .collection(USERS_COLLECTION)
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
      .collection(USERS_COLLECTION)
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

const enrichBatch = (raw, productMap, userMap) => ({
  id: raw.id,
  productId: productMap[raw.productId] || { id: raw.productId, name: 'Produit supprimé' },
  quantityPlanned: raw.quantityPlanned,
  quantityProduced: raw.quantityProduced || 0,
  status: raw.status,
  createdBy: userMap[raw.createdBy] || { id: raw.createdBy, nom: 'Utilisateur supprimé' },
  createdAt: toIsoDate(raw.createdAt),
  startedAt: toIsoDate(raw.startedAt),
  endedAt: toIsoDate(raw.endedAt),
  updatedAt: toIsoDate(raw.updatedAt),
});

const sanitizeTest = (t) => ({
  id: t.id,
  batchId: t.batchId,
  testedBy: t.testedBy,
  status: t.status,
  notes: t.notes || '',
  testedAt: toIsoDate(t.testedAt),
  createdAt: toIsoDate(t.createdAt),
  batch: t.batch || null,
});

const createTest = async (payload, actor) => {
  const validatedPayload = validate(createQualityTestSchema, payload);

  const snapshot = await db.collection(PRODUCTIONS_COLLECTION).doc(validatedPayload.batchId).get();
  if (!snapshot.exists) {
    throw new AppError('Production batch not found', 404);
  }
  if (snapshot.data().status !== 'COMPLETED') {
    throw new AppError(`Quality tests can only be created for COMPLETED batches. Current batch status: ${snapshot.data().status}`, 400);
  }

  const docRef = db.collection(QUALITY_TESTS_COLLECTION).doc();
  const test = {
    id: docRef.id,
    batchId: validatedPayload.batchId,
    status: 'PENDING',
    notes: validatedPayload.notes || '',
    testedBy: null,
    testedAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: actor.userId,
  };

  await docRef.set(test);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'QUALITY_TEST_CREATED',
    targetType: 'quality_test',
    targetId: test.id,
    metadata: { batchId: test.batchId },
  });

  const userMap = await resolveUsers(actor.userId);
  const productMap = await resolveProducts(snapshot.data().productId);
  const enriched = enrichBatch({ id: snapshot.id, ...snapshot.data() }, productMap, userMap);

  return sanitizeTest({
    ...test,
    createdAt: new Date(),
    testedBy: userMap[actor.userId] || { id: actor.userId, nom: 'Utilisateur supprimé' },
    batch: enriched,
  });
};

const listTests = async (query) => {
  const validatedQuery = validate(listTestsQuerySchema, query);
  let firestoreQuery = db.collection(QUALITY_TESTS_COLLECTION).orderBy('createdAt', 'desc');

  if (validatedQuery.batchId) {
    firestoreQuery = firestoreQuery.where('batchId', '==', validatedQuery.batchId);
  }

  const snapshot = await firestoreQuery.get();
  const allResults = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const userIds = allResults.map((t) => t.testedBy).filter(Boolean);
  const batchIds = allResults.map((t) => t.batchId).filter(Boolean);

  const [userMap, productMap] = await Promise.all([
    resolveUsers(...userIds),
    (async () => {
      if (batchIds.length === 0) return {};
      const batchSnapshots = await Promise.all(
        batchIds.map((id) => db.collection(PRODUCTIONS_COLLECTION).doc(id).get())
      );
      const productIds = batchSnapshots
        .filter((d) => d.exists)
        .map((d) => d.data().productId)
        .filter(Boolean);
      return resolveProducts(...productIds);
    })(),
  ]);

  const batchDataMap = {};
  if (batchIds.length > 0) {
    const batchSnapshots = await Promise.all(
      batchIds.map((id) =>
        db.collection(PRODUCTIONS_COLLECTION).doc(id).get().then((d) => ({ id, d }))
      )
    );
    batchSnapshots.forEach(({ id, d }) => {
      if (d.exists) {
        batchDataMap[id] = enrichBatch({ id: d.id, ...d.data() }, productMap, userMap);
      }
    });
  }

  const testsWithDetails = allResults.map((test) => ({
    ...test,
    testedBy: test.testedBy
      ? userMap[test.testedBy] || { id: test.testedBy, nom: 'Utilisateur supprimé' }
      : null,
    batch: batchDataMap[test.batchId] || null,
  }));

  const total = testsWithDetails.length;
  const startIndex = (validatedQuery.page - 1) * validatedQuery.limit;
  const paginated = testsWithDetails
    .slice(startIndex, startIndex + validatedQuery.limit)
    .map(sanitizeTest);

  return {
    items: paginated,
    pagination: {
      page: validatedQuery.page,
      limit: validatedQuery.limit,
      total,
      totalPages: Math.ceil(total / validatedQuery.limit) || 1,
    }
  };
};

const getTestById = async (id) => {
  validate(testIdParamSchema, { id });
  const snapshot = await db.collection(QUALITY_TESTS_COLLECTION).doc(id).get();

  if (!snapshot.exists) {
    throw new AppError('Quality test not found', 404);
  }

  const testData = { id: snapshot.id, ...snapshot.data() };

  const [userMap, batchSnap] = await Promise.all([
    resolveUsers(testData.testedBy),
    db.collection(PRODUCTIONS_COLLECTION).doc(testData.batchId).get(),
  ]);

  let enriched = null;
  if (batchSnap.exists) {
    const productMap = await resolveProducts(batchSnap.data().productId);
    enriched = enrichBatch({ id: batchSnap.id, ...batchSnap.data() }, productMap, userMap);
  }

  return sanitizeTest({
    ...testData,
    testedBy: testData.testedBy
      ? userMap[testData.testedBy] || { id: testData.testedBy, nom: 'Utilisateur supprimé' }
      : null,
    batch: enriched,
  });
};

const updateTest = async (id, payload, actor) => {
  validate(testIdParamSchema, { id });
  const validatedPayload = validate(updateQualityTestSchema, payload);

  const docRef = db.collection(QUALITY_TESTS_COLLECTION).doc(id);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new AppError('Quality test not found', 404);
  }

  const currentData = snapshot.data();
  if (currentData.status !== 'PENDING') {
    throw new AppError(`Quality test already has status ${currentData.status} and cannot be updated`, 400);
  }

  const updates = {
    status: validatedPayload.status,
    notes: validatedPayload.notes !== undefined ? validatedPayload.notes : currentData.notes,
    testedBy: actor.userId,
    testedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await docRef.update(updates);

  if (validatedPayload.status === 'FAILED') {
    await notificationService.sendNotification({
      title: '⚠️ QUALITY ALERT',
      message: `Production batch #${currentData.batchId} FAILED quality inspection.`,
      type: 'WARNING',
      targetType: 'ROLE',
      targetValue: 'PRODUCTION',
    });
    await notificationService.sendNotification({
      title: '⚠️ QUALITY ALERT',
      message: `Production batch #${currentData.batchId} FAILED quality inspection.`,
      type: 'WARNING',
      targetType: 'ROLE',
      targetValue: 'QUALITY',
    });
  }

  await writeAuditLog({
    actorUserId: actor.userId,
    action: `QUALITY_TEST_${validatedPayload.status}`,
    targetType: 'quality_test',
    targetId: id,
    metadata: { notes: updates.notes },
  });

  qualityReportService.deleteReport(id);

  const updatedSnapshot = await docRef.get();
  const updatedTest = { id: updatedSnapshot.id, ...updatedSnapshot.data() };

  const [userMap, batchSnap] = await Promise.all([
    resolveUsers(actor.userId),
    db.collection(PRODUCTIONS_COLLECTION).doc(updatedTest.batchId).get(),
  ]);

  let enriched = null;
  if (batchSnap.exists) {
    const productMap = await resolveProducts(batchSnap.data().productId);
    enriched = enrichBatch({ id: batchSnap.id, ...batchSnap.data() }, productMap, userMap);
  }

  return sanitizeTest({
    ...updatedTest,
    testedBy: userMap[actor.userId] || { id: actor.userId, nom: 'Utilisateur supprimé' },
    batch: enriched,
  });
};

module.exports = {
  createTest,
  listTests,
  getTestById,
  updateTest,
};
