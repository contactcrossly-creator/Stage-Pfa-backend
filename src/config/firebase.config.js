const admin = require('firebase-admin');
require('dotenv').config();
const { getEnv } = require('./env.config');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: getEnv('FIREBASE_PROJECT_ID'),
    clientEmail: getEnv('FIREBASE_CLIENT_EMAIL'),
    privateKey: getEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();

module.exports = { admin, db };
