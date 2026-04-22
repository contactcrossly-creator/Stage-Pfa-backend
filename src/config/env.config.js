const REQUIRED_ENV_VARS = [
  'JWT_SECRET',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
];

const getEnv = (key, fallback) => {
  const value = process.env[key];

  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const validateEnv = () => {
  REQUIRED_ENV_VARS.forEach((key) => {
    getEnv(key);
  });
};

module.exports = {
  getEnv,
  validateEnv,
};
