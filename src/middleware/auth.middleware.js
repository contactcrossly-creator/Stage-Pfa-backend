const { admin, db } = require('../config/firebase.config');
const { verifyToken } = require('../utils/jwt.util');

/**
 * Verifies Firebase ID token or JWT from Authorization header.
 * Supports both auth flows:
 *   1. JWT token (existing frontend login flow)
 *   2. Firebase ID token (via custom token exchange)
 * The user role is always read from Firestore, never from the token.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    let uid;

    // Try JWT first (existing frontend flow), then fall back to Firebase ID token
    try {
      const payload = verifyToken(token);
      uid = payload.userId;
    } catch {
      const decodedToken = await admin.auth().verifyIdToken(token);
      uid = decodedToken.uid;
    }

    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.status(403).json({ error: 'User not found' });
    }

    const userData = userDoc.data();

    req.user = {
      uid: uid,
      role: userData.role || 'EMPLOYEE',
      email: userData.email || '',
      ...userData,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired' });
    }

    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = { verifyFirebaseToken };