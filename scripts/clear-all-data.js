require('dotenv').config();
const { validateEnv } = require('../src/config/env.config');
const { db } = require('../src/config/firebase.config');

const COLLECTIONS = [
  'products',
  'stock_movements',
  'production_batches',
  'quality_tests',
  'incidents',
  'groups',
  'notifications',
  'audit_logs',
  'chat_sessions',
];

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
  if (!args.includes('--force') && !args.includes('-f')) {
    const ok = await confirm(
      '⚠️  This will DELETE ALL DATA except users.\nType "yes" to continue: '
    );
    if (!ok) {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  console.log(`\nDeleting ${COLLECTIONS.length} collections in parallel...`);

  await Promise.all(
    COLLECTIONS.map((name) => db.recursiveDelete(db.collection(name)))
  );

  console.log('✅ All collections cleared. Users preserved.');
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Failed to clear data:', error.message);
    process.exit(1);
  });
