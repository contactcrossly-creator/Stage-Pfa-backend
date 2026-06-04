const { db } = require('../config/firebase.config');
const { ROLE_PERMISSIONS } = require('../config/roles.config');

const KEYWORD_COLLECTION_MAP = {
  stock: ['stock', 'inventory', 'warehouse', 'product', 'item', 'supply'],
  suppliers: ['supplier', 'vendor', 'provider', 'purchase'],
  orders: ['order', 'purchase order', 'po', 'delivery'],
  incidents: ['incident', 'accident', 'injury', 'hazard'],
  inspections: ['inspection', 'audit', 'check', 'compliance'],
  safety_reports: ['safety', 'risk', 'report'],
  quality_checks: ['quality', 'qc', 'check', 'inspection', 'test'],
  defects: ['defect', 'issue', 'problem', 'non-conformance'],
  audits: ['audit', 'assessment', 'evaluation'],
  products: ['product', 'item', 'goods', 'manufacturing'],
  tasks: ['task', 'job', 'assignment', 'todo'],
  schedule: ['schedule', 'shift', 'calendar', 'meeting', 'appointment'],
  announcements: ['announcement', 'notice', 'news', 'update'],
  employees: ['employee', 'staff', 'worker', 'personnel'],
};

class ContextService {
  /**
   * Extracts keywords from user message for smart context retrieval.
   * @param {string} message - User's input message
   * @returns {string[]} Array of keywords
   */
  extractKeywords(message) {
    const lowerMessage = message.toLowerCase();
    const words = lowerMessage.split(/\s+/);
    const keywords = new Set();

    words.forEach((word) => {
      if (word.length > 2) {
        keywords.add(word);
      }
    });

    return Array.from(keywords);
  }

  /**
   * Determines which collections to fetch based on keywords in the message.
   * @param {string} role - User's role
   * @param {string} message - User's input message
   * @returns {string[]} Array of collection names to fetch
   */
  determineCollections(role, message) {
    const roleConfig = ROLE_PERMISSIONS[role];
    if (!roleConfig) {
      return roleConfig?.collections || [];
    }

    const keywords = this.extractKeywords(message);
    const matchedCollections = new Set();

    keywords.forEach((keyword) => {
      Object.entries(KEYWORD_COLLECTION_MAP).forEach(([collection, relatedKeywords]) => {
        if (relatedKeywords.some((kw) => keyword.includes(kw) || kw.includes(keyword))) {
          if (roleConfig.collections.includes(collection)) {
            matchedCollections.add(collection);
          }
        }
      });
    });

    if (matchedCollections.size === 0) {
      return roleConfig.collections;
    }

    return Array.from(matchedCollections);
  }

  /**
   * Fetches data from a Firestore collection with optional filtering.
   * @param {string} collectionName - Name of the Firestore collection
   * @param {string} userId - User's ID for filtering (optional)
   * @param {boolean} isEmployee - Whether the user is an EMPLOYEE role
   * @returns {Promise<Array>} Array of document data
   */
  async fetchCollection(collectionName, userId, isEmployee) {
    try {
      const collectionRef = db.collection(collectionName);
      let query = collectionRef.limit(30);

      if (isEmployee && userId) {
        query = collectionRef.where('assignedTo', '==', userId).limit(30);
      }

      const snapshot = await query.get();

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error(`Error fetching ${collectionName}:`, error.message);
      return [];
    }
  }

  /**
   * Gets smart context data based on user role and message.
   * @param {string} role - User's role
   * @param {string} userMessage - User's input message
   * @param {string} userId - User's Firebase UID
   * @returns {Promise<Object>} Object keyed by collection name with document arrays
   */
  async getSmartContext(role, userMessage, userId) {
    const collections = this.determineCollections(role, userMessage);
    const isEmployee = role === 'EMPLOYEE';

    const fetchPromises = collections.map((collection) =>
      this.fetchCollection(collection, userId, isEmployee).then((data) => [collection, data])
    );

    const results = await Promise.all(fetchPromises);

    const context = {};
    results.forEach(([collection, data]) => {
      context[collection] = data;
    });

    return context;
  }
}

module.exports = new ContextService();