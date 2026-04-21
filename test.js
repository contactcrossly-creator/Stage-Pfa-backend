const { db } = require('./src/config/firebase.config');

async function test() {
  const res = await db.collection('test').add({
    message: 'Firebase connected',
    createdAt: new Date()
  });

  console.log('✅ Firestore working:', res.id);
}

test();