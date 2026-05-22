const { db } = require('../../config/firebase.config');

const USERS_COLLECTION = 'users';
const PRODUCTS_COLLECTION = 'products';
const MOVEMENTS_COLLECTION = 'stock_movements';
const PRODUCTIONS_COLLECTION = 'production_batches';
const QUALITY_TESTS_COLLECTION = 'quality_tests';
const INCIDENTS_COLLECTION = 'incidents';
const GROUPS_COLLECTION = 'groups';

const getDashboardStats = async () => {
  const [
    usersSnapshot,
    productsSnapshot,
    movementsSnapshot,
    productionsSnapshot,
    qualitySnapshot,
    incidentsSnapshot,
    groupsSnapshot,
  ] = await Promise.all([
    db.collection(USERS_COLLECTION).get(),
    db.collection(PRODUCTS_COLLECTION).get(),
    db.collection(MOVEMENTS_COLLECTION).get(),
    db.collection(PRODUCTIONS_COLLECTION).get(),
    db.collection(QUALITY_TESTS_COLLECTION).get(),
    db.collection(INCIDENTS_COLLECTION).get(),
    db.collection(GROUPS_COLLECTION).get(),
  ]);

  const users = usersSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  const products = productsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  const movements = movementsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  const productions = productionsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  const qualityTests = qualitySnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  const incidents = incidentsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  const groups = groupsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  const roleCounts = { ADMIN: 0, EMPLOYEE: 0, QUALITY: 0, HSE: 0, STOCK: 0 };
  let activeUsers = 0;
  let inactiveUsers = 0;

  users.forEach((u) => {
    if (roleCounts[u.role] !== undefined) roleCounts[u.role]++;
    if (u.isActive === false) inactiveUsers++;
    else activeUsers++;
  });

  const productionStatusCounts = { PENDING: 0, RUNNING: 0, COMPLETED: 0, CANCELLED: 0 };
  productions.forEach((p) => {
    if (productionStatusCounts[p.status] !== undefined) productionStatusCounts[p.status]++;
  });

  const qualityStatusCounts = { PENDING: 0, PASSED: 0, FAILED: 0 };
  qualityTests.forEach((q) => {
    if (qualityStatusCounts[q.status] !== undefined) qualityStatusCounts[q.status]++;
  });
  const totalQuality = qualityTests.length;
  const passRate = totalQuality > 0 ? Math.round((qualityStatusCounts.PASSED / totalQuality) * 100) : 0;

  const incidentStatusCounts = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0 };
  const incidentPriorityCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  incidents.forEach((inc) => {
    if (incidentStatusCounts[inc.status] !== undefined) incidentStatusCounts[inc.status]++;
    if (incidentPriorityCounts[inc.priority] !== undefined) incidentPriorityCounts[inc.priority]++;
  });

  let lowStockProducts = 0;
  products.forEach((p) => {
    if (p.quantity !== undefined && p.minThreshold !== undefined && p.quantity <= p.minThreshold) {
      lowStockProducts++;
    }
  });

  let movementsIn = 0;
  let movementsOut = 0;
  movements.forEach((m) => {
    if (m.type === 'IN') movementsIn++;
    else if (m.type === 'OUT') movementsOut++;
  });

  return {
    users: {
      total: users.length,
      byRole: roleCounts,
      active: activeUsers,
      inactive: inactiveUsers,
    },
    stock: {
      totalProducts: products.length,
      lowStock: lowStockProducts,
      movements: {
        total: movements.length,
        in: movementsIn,
        out: movementsOut,
      },
    },
    production: {
      total: productions.length,
      byStatus: productionStatusCounts,
    },
    quality: {
      total: totalQuality,
      byStatus: qualityStatusCounts,
      passRate,
    },
    hse: {
      total: incidents.length,
      byStatus: incidentStatusCounts,
      byPriority: incidentPriorityCounts,
    },
    groups: {
      total: groups.length,
    },
    summary: {
      totalProducts: products.length,
      totalProductions: productions.length,
      totalIncidents: incidents.length,
      totalQualityTests: totalQuality,
    },
  };
};

const getEmployeeDashboard = async (userId) => {
  const [productionsSnapshot] = await Promise.all([
    db.collection(PRODUCTIONS_COLLECTION).get(),
  ]);

  const productions = productionsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  const userProductions = productions.filter((p) => p.createdBy === userId);

  const productionStatusCounts = { PENDING: 0, RUNNING: 0, COMPLETED: 0, CANCELLED: 0 };
  productions.forEach((p) => {
    if (productionStatusCounts[p.status] !== undefined) productionStatusCounts[p.status]++;
  });

  const userStatusCounts = { PENDING: 0, RUNNING: 0, COMPLETED: 0, CANCELLED: 0 };
  userProductions.forEach((p) => {
    if (userStatusCounts[p.status] !== undefined) userStatusCounts[p.status]++;
  });

  return {
    role: 'EMPLOYEE',
    production: {
      total: productions.length,
      byStatus: productionStatusCounts,
      myProductions: {
        total: userProductions.length,
        byStatus: userStatusCounts,
      },
    },
  };
};

const getQualityDashboard = async () => {
  const [qualitySnapshot] = await Promise.all([
    db.collection(QUALITY_TESTS_COLLECTION).get(),
  ]);

  const qualityTests = qualitySnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  const qualityStatusCounts = { PENDING: 0, PASSED: 0, FAILED: 0 };
  qualityTests.forEach((q) => {
    if (qualityStatusCounts[q.status] !== undefined) qualityStatusCounts[q.status]++;
  });
  const totalQuality = qualityTests.length;
  const passRate = totalQuality > 0 ? Math.round((qualityStatusCounts.PASSED / totalQuality) * 100) : 0;

  return {
    role: 'QUALITY',
    quality: {
      total: totalQuality,
      byStatus: qualityStatusCounts,
      passRate,
    },
  };
};

const getHseDashboard = async () => {
  const [incidentsSnapshot] = await Promise.all([
    db.collection(INCIDENTS_COLLECTION).get(),
  ]);

  const incidents = incidentsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  const incidentStatusCounts = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0 };
  const incidentPriorityCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  incidents.forEach((inc) => {
    if (incidentStatusCounts[inc.status] !== undefined) incidentStatusCounts[inc.status]++;
    if (incidentPriorityCounts[inc.priority] !== undefined) incidentPriorityCounts[inc.priority]++;
  });

  return {
    role: 'HSE',
    hse: {
      total: incidents.length,
      byStatus: incidentStatusCounts,
      byPriority: incidentPriorityCounts,
    },
  };
};

const getStockDashboard = async () => {
  const [productsSnapshot, movementsSnapshot] = await Promise.all([
    db.collection(PRODUCTS_COLLECTION).get(),
    db.collection(MOVEMENTS_COLLECTION).get(),
  ]);

  const products = productsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  const movements = movementsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  let lowStockProducts = 0;
  products.forEach((p) => {
    if (p.quantity !== undefined && p.minThreshold !== undefined && p.quantity <= p.minThreshold) {
      lowStockProducts++;
    }
  });

  let movementsIn = 0;
  let movementsOut = 0;
  movements.forEach((m) => {
    if (m.type === 'IN') movementsIn++;
    else if (m.type === 'OUT') movementsOut++;
  });

  return {
    role: 'STOCK',
    stock: {
      totalProducts: products.length,
      lowStock: lowStockProducts,
      movements: {
        total: movements.length,
        in: movementsIn,
        out: movementsOut,
      },
    },
  };
};

module.exports = {
  getDashboardStats,
  getEmployeeDashboard,
  getQualityDashboard,
  getHseDashboard,
  getStockDashboard,
};
