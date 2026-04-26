const { db } = require('../src/config/firebase.config');

const groupId = 'Ec0P3IiP1PIaHUW9u4w0'; 

console.log(`📡 Listening for real-time messages in group: ${groupId}...`);

db.collection('messages')
  .where('groupId', '==', groupId)
  .onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const msg = change.doc.data();
        console.log(`\n✨ NEW MESSAGE RECEIVED!`);
        console.log(`Content: ${msg.content}`);
      }
    });
  });
