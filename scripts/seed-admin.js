require('dotenv').config();

const { validateEnv } = require('../src/config/env.config');

const getCliArg = (name) => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));

  return arg ? arg.slice(prefix.length) : undefined;
};

const main = async () => {
  validateEnv();
  const { createInitialAdmin } = require('../src/modules/auth/auth.service');

  const adminPayload = {
    nom: getCliArg('name') || process.env.SEED_ADMIN_NAME,
    email: getCliArg('email') || process.env.SEED_ADMIN_EMAIL,
    password: getCliArg('password') || process.env.SEED_ADMIN_PASSWORD,
    mustChangePassword: true,
  };

  const missingFields = Object.entries({
    SEED_ADMIN_NAME: adminPayload.nom,
    SEED_ADMIN_EMAIL: adminPayload.email,
    SEED_ADMIN_PASSWORD: adminPayload.password,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingFields.length > 0) {
    throw new Error(
      `Missing admin seed configuration: ${missingFields.join(', ')}. ` +
        'Set them in .env or pass --name= --email= --password=.'
    );
  }

  const user = await createInitialAdmin(adminPayload);

  console.log('Initial admin created successfully');
  console.log(user);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to seed admin user');
    console.error(error.message);
    if (error.details) {
      console.error(JSON.stringify(error.details, null, 2));
    }
    process.exit(1);
  });
