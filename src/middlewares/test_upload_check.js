
const path = require('path');
console.log('__dirname:', __dirname);
console.log('resolved dest:', path.join(__dirname, '../../uploads/incidents'));
const fs2 = require('fs');
console.log('dest exists:', fs2.existsSync(path.join(__dirname, '../../uploads/incidents')));
