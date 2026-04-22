require('dotenv').config();
const { validateEnv } = require('./src/config/env.config');

validateEnv();

const app = require('./src/app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
