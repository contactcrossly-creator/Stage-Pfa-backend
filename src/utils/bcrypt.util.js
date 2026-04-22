const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

const hashPassword = (plainPassword) => bcrypt.hash(plainPassword, SALT_ROUNDS);

const comparePassword = (plainPassword, passwordHash) =>
  bcrypt.compare(plainPassword, passwordHash);

module.exports = {
  hashPassword,
  comparePassword,
};
