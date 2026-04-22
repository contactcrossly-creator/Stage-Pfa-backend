const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
  QUALITY: 'QUALITY',
  HSE: 'HSE',
  STOCK: 'STOCK',
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

module.exports = {
  ROLES,
  ROLE_VALUES,
};
