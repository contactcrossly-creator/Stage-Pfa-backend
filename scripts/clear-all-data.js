require('dotenv').config();
const { validateEnv } = require('../src/config/env.config');

const BATCH_SIZE = 500;

const deleteCollection = async (collectionPath) => {
  const collectionRef = require('../src/config/firebase.config').db.collection(collectionPath);
  let totalDeleted = 0;

  while (true) {
    const snapshot = await collectionRef.limit(BATCH_SIZE).get();
    if (snapshot.empty) break;

    const batch = require('../src/config/firebase.config').db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    totalDeleted += snapshot.size;
    console.log(`  Deleted ${snapshot.size} docs from ${collectionPath}...`);
  }

  return totalDeleted;
};

const deleteNonAdminUsers = async () => {
  const { db } = require('../src/config/firebase.config');
  let totalDeleted = 0;

  while (true) {
    const snapshot = await db.collection('users').limit(BATCH_SIZE).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    const toDelete = [];

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.role !== 'ADMIN') {
        batch.delete(doc.ref);
        toDelete.push(doc.id);
      }
    });

    if (toDelete.length > 0) {
      await batch.commit();
      totalDeleted += toDelete.length;
      console.log(`  Deleted ${toDelete.length} non-admin users...`);
    }
  }

  return totalDeleted;
};

const deleteMessagesSubcollection = async () => {
  const { db } = require('../src/config/firebase.config');
  let totalDeleted = 0;

  while (true) {
    const snapshot = await db.collectionGroup('messages').limit(BATCH_SIZE).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    totalDeleted += snapshot.size;
    console.log(`  Deleted ${snapshot.size} messages...`);
  }

  return totalDeleted;
};

const confirm = (message) => {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
};

const main = async () => {
  validateEnv();

  const args = process.argv.slice(2);
  const skipConfirm = args.includes('--force') || args.includes('-f');

  if (!skipConfirm) {
    const ok = await confirm(
      '⚠️  This will DELETE ALL DATA in Firestore except the admin user.\n' +
      'Type "yes" to continue: '
    );
    if (!ok) {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  console.log('\n--- Deleting non-admin users...');
  const usersDeleted = await deleteNonAdminUsers();
  console.log(`  Done: ${usersDeleted} users deleted`);

  const collections = [
    'groups',
    'products',
    'production_batches',
    'stock_movements',
    'quality_tests',
    'incidents',
    'notifications',
    'audit_logs',
    'chat_sessions',
  ];

  for (const col of collections) {
    console.log(`\n--- Cleaning ${col}...`);
    const count = await deleteCollection(col);
    console.log(`  Done: ${count} docs deleted from ${col}`);
  }

  console.log('\n--- Deleting messages subcollections...');
  const messagesDeleted = await deleteMessagesSubcollection();
  console.log(`  Done: ${messagesDeleted} messages deleted`);

  console.log('\n✅ All data cleared. Admin user preserved.');
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Failed to clear data:', error.message);
    process.exit(1);
  });
