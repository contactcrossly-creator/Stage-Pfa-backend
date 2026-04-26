const { db, admin } = require('../../config/firebase.config');
const { AppError } = require('../../utils/app-error.util');
const { writeAuditLog } = require('../user/user.service');
const {
  createIncidentSchema,
  updateIncidentSchema,
  incidentIdParamSchema,
  listIncidentsQuerySchema,
} = require('./hse.model');

const INCIDENTS_COLLECTION = 'incidents';

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

const sanitizeIncident = (i) => ({
  id: i.id,
  title: i.title,
  description: i.description,
  type: i.type,
  priority: i.priority,
  status: i.status,
  reportedBy: i.reportedBy,
  assignedTo: i.assignedTo || null,
  createdAt: toIsoDate(i.createdAt),
  resolvedAt: toIsoDate(i.resolvedAt),
  updatedAt: toIsoDate(i.updatedAt),
});

const triggerCriticalAlert = async (incident) => {
  console.warn(`🚨 [HSE ALERT] CRITICAL INCIDENT REPORTED!`, {
    id: incident.id,
    title: incident.title,
    type: incident.type,
  });
  // Note: Here you would typically send Push Notifications (FCM) or SMS.
};

const getIncidentById = async (id) => {
  validate(incidentIdParamSchema, { id });
  const snapshot = await db.collection(INCIDENTS_COLLECTION).doc(id).get();

  if (!snapshot.exists) {
    throw new AppError('Incident not found', 404);
  }

  return { id: snapshot.id, ...snapshot.data() };
};

const createIncident = async (payload, actor) => {
  const validatedPayload = validate(createIncidentSchema, payload);

  const docRef = db.collection(INCIDENTS_COLLECTION).doc();
  const incident = {
    id: docRef.id,
    title: validatedPayload.title,
    description: validatedPayload.description,
    type: validatedPayload.type,
    priority: validatedPayload.priority || 'LOW',
    status: 'OPEN',
    reportedBy: actor.userId,
    assignedTo: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    resolvedAt: null,
  };

  await docRef.set(incident);

  if (incident.priority === 'CRITICAL') {
    await triggerCriticalAlert(incident);
  }

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'INCIDENT_REPORTED',
    targetType: 'incident',
    targetId: incident.id,
    metadata: { type: incident.type, priority: incident.priority },
  });

  return sanitizeIncident({ ...incident, createdAt: new Date() });
};

const listIncidents = async (query, actor, filterByMy = false) => {
  const validatedQuery = validate(listIncidentsQuerySchema, query);
  let firestoreQuery = db.collection(INCIDENTS_COLLECTION).orderBy('createdAt', 'desc');

  if (filterByMy) {
    // If 'my', filter where reportedBy == actor OR assignedTo == actor
    // Firestore doesn't support easy OR across fields in simple queries without composite indexes or multiple queries.
    // We'll perform it by getting all and filtering in memory for 'my' or use two queries.
    // For simplicity, we'll fetch where reportedBy == actor and assignedTo == actor separately.
    const [reportedByMe, assignedToMe] = await Promise.all([
        db.collection(INCIDENTS_COLLECTION).where('reportedBy', '==', actor.userId).get(),
        db.collection(INCIDENTS_COLLECTION).where('assignedTo', '==', actor.userId).get()
    ]);
    
    const combinedIds = new Set([
        ...reportedByMe.docs.map(d => d.id),
        ...assignedToMe.docs.map(d => d.id)
    ]);
    
    const allDocs = await Promise.all(Array.from(combinedIds).map(id => db.collection(INCIDENTS_COLLECTION).doc(id).get()));
    let items = allDocs.map(d => ({ id: d.id, ...d.data() }));
    
    // Sort combined results
    items.sort((a, b) => {
        const bTime = b.createdAt?.toMillis?.() || 0;
        const aTime = a.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
    });
    
    return { items: items.map(sanitizeIncident) };
  }

  if (validatedQuery.status) firestoreQuery = firestoreQuery.where('status', '==', validatedQuery.status);
  if (validatedQuery.type) firestoreQuery = firestoreQuery.where('type', '==', validatedQuery.type);
  if (validatedQuery.priority) firestoreQuery = firestoreQuery.where('priority', '==', validatedQuery.priority);

  const snapshot = await firestoreQuery.get();
  const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const total = all.length;
  const startIndex = (validatedQuery.page - 1) * validatedQuery.limit;
  const paginated = all.slice(startIndex, startIndex + validatedQuery.limit).map(sanitizeIncident);

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

const updateIncident = async (id, payload, actor) => {
  validate(incidentIdParamSchema, { id });
  const validatedPayload = validate(updateIncidentSchema, payload);
  const incident = await getIncidentById(id);

  const isAdminOrHse = actor.role === 'ADMIN' || actor.role === 'HSE';
  const isReporter = incident.reportedBy === actor.userId;

  // Business Rules for Roles
  if (!isAdminOrHse) {
    if (validatedPayload.priority) throw new AppError('Only HSE and ADMIN can change priority', 403);
    if (validatedPayload.assignedTo !== undefined) throw new AppError('Only HSE and ADMIN can assign incidents', 403);
    if (!isReporter) throw new AppError('Unauthorized to update this incident', 403);
  }

  const updates = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (validatedPayload.title) updates.title = validatedPayload.title;
  if (validatedPayload.description) updates.description = validatedPayload.description;
  if (validatedPayload.type) updates.type = validatedPayload.type;
  
  if (isAdminOrHse) {
      if (validatedPayload.priority) updates.priority = validatedPayload.priority;
      if (validatedPayload.assignedTo !== undefined) updates.assignedTo = validatedPayload.assignedTo;
  }

  if (validatedPayload.status) {
    // Status flow validation
    const statusOrder = { 'OPEN': 1, 'IN_PROGRESS': 2, 'RESOLVED': 3 };
    const currentScore = statusOrder[incident.status];
    const newScore = statusOrder[validatedPayload.status];

    if (newScore < currentScore) {
        throw new AppError(`Cannot move status back from ${incident.status} to ${validatedPayload.status}`, 400);
    }
    
    updates.status = validatedPayload.status;
    if (validatedPayload.status === 'RESOLVED') {
        updates.resolvedAt = admin.firestore.FieldValue.serverTimestamp();
    }
  }

  await db.collection(INCIDENTS_COLLECTION).doc(id).update(updates);

  if (updates.priority === 'CRITICAL' && incident.priority !== 'CRITICAL') {
      await triggerCriticalAlert({ ...incident, ...updates });
  }

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'INCIDENT_UPDATED',
    targetType: 'incident',
    targetId: id,
    metadata: validatedPayload,
  });

  return sanitizeIncident(await getIncidentById(id));
};

const triggerManualAlert = async (id, actor) => {
    const incident = await getIncidentById(id);
    await triggerCriticalAlert(incident);
    
    await writeAuditLog({
        actorUserId: actor.userId,
        action: 'INCIDENT_ALERT_TRIGGERED',
        targetType: 'incident',
        targetId: id,
    });
    
    return { message: 'Alert triggered successfully' };
};

module.exports = {
  createIncident,
  listIncidents,
  getIncidentById: async (id) => sanitizeIncident(await getIncidentById(id)),
  updateIncident,
  triggerManualAlert,
};
