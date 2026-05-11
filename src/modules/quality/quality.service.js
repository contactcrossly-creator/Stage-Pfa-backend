const { db, admin } = require('../../config/firebase.config');
const { AppError } = require('../../utils/app-error.util');
const { writeAuditLog } = require('../user/user.service');
const notificationService = require('../notification/notification.service');
const {
  createQualityTestSchema,
  updateQualityTestSchema,
  testIdParamSchema,
  listTestsQuerySchema,
} = require('./quality.model');

const QUALITY_TESTS_COLLECTION = 'quality_tests';
const PRODUCTIONS_COLLECTION = 'production_batches';

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

const getUserName = async (userId) => {
  if (!userId) return null;
  try {
    const snapshot = await db.collection('users').doc(userId).get();
    if (snapshot.exists) {
      return snapshot.data().nom || null;
    }
    return null;
  } catch (error) {
    console.warn(`User ${userId} not found for quality test`);
    return null;
  }
};

const sanitizeTest = (t) => ({
  id: t.id,
  batchId: t.batchId,
  testedBy: t.testedBy || null,
  testedByName: t.testedByName || null,
  batchName: t.batchName || null,
  status: t.status,
  notes: t.notes || '',
  testedAt: toIsoDate(t.testedAt),
  createdAt: toIsoDate(t.createdAt),
  batch: t.batch || null,
});

const getBatch = async (batchId) => {
  const snapshot = await db.collection(PRODUCTIONS_COLLECTION).doc(batchId).get();
  if (!snapshot.exists) {
    throw new AppError('Production batch not found', 404);
  }
  return snapshot.data();
};

const createTest = async (payload, actor) => {
  const validatedPayload = validate(createQualityTestSchema, payload);

  // Business Rule: Batch must exist and be COMPLETED
  const batch = await getBatch(validatedPayload.batchId);
  if (batch.status !== 'COMPLETED') {
    throw new AppError(`Quality tests can only be created for COMPLETED batches. Current batch status: ${batch.status}`, 400);
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

  return sanitizeTest({ ...test, createdAt: new Date() });
};

const listTests = async (query) => {
  const validatedQuery = validate(listTestsQuerySchema, query);
  let firestoreQuery = db.collection(QUALITY_TESTS_COLLECTION).orderBy('createdAt', 'desc');

  if (validatedQuery.batchId) {
    firestoreQuery = firestoreQuery.where('batchId', '==', validatedQuery.batchId);
  }

  const snapshot = await firestoreQuery.get();
  const allResults = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // Fetch batch details and tester names for each test
  const testsWithDetails = await Promise.all(
    allResults.map(async (test) => {
      try {
        const batch = await getBatch(test.batchId);
        const batchName = batch.productName || null;
        const testedByName = test.testedBy ? await getUserName(test.testedBy) : null;
        return { ...test, batch, batchName, testedByName };
      } catch (error) {
        // If batch not found, still return test but without batch info
        console.warn(`Batch ${test.batchId} not found for quality test ${test.id}`);
        const testedByName = test.testedBy ? await getUserName(test.testedBy) : null;
        return { ...test, batch: null, batchName: null, testedByName };
      }
    })
  );

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
  
  // Resolve tester name
  const testedByName = testData.testedBy ? await getUserName(testData.testedBy) : null;
  
  // Fetch batch details for consistency with list view
  try {
    const batch = await getBatch(testData.batchId);
    const batchName = batch.productName || null;
    return sanitizeTest({ ...testData, batch, batchName, testedByName });
  } catch (error) {
    // If batch not found, still return test but without batch info
    console.warn(`Batch ${testData.batchId} not found for quality test ${testData.id}`);
    return sanitizeTest({ ...testData, batch: null, batchName: null, testedByName });
  }
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

  const updatedSnapshot = await docRef.get();
  const updatedTest = { id: updatedSnapshot.id, ...updatedSnapshot.data() };
  const testedByName = updatedTest.testedBy ? await getUserName(updatedTest.testedBy) : null;
  return sanitizeTest({ ...updatedTest, testedByName });
};

module.exports = {
  createTest,
  listTests,
  getTestById,
  updateTest,
};
