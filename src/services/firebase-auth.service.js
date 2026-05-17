const { admin } = require('../config/firebase.config');

const getAccessToken = async () => {
  const app = admin.app();
  if (!app.options.credential || typeof app.options.credential.getAccessToken !== 'function') {
    throw new Error('Firebase credential does not support getAccessToken');
  }
  return app.options.credential.getAccessToken();
};

const createFirebaseUser = async ({ email, password, displayName }) => {
  try {
    const userRecord = await admin.auth().createUser({
      email: email.toLowerCase(),
      password,
      displayName,
    });
    return userRecord.uid;
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      const user = await admin.auth().getUserByEmail(email.toLowerCase());
      await admin.auth().updateUser(user.uid, { password, displayName });
      return user.uid;
    }
    throw error;
  }
};

const sendPasswordResetEmail = async (email) => {
  const { access_token } = await getAccessToken();
  const response = await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify({
        requestType: 'PASSWORD_RESET',
        email: email.toLowerCase(),
      }),
    },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to send password reset email');
  }
  return { sent: true };
};

const updateFirebasePassword = async (uid, newPassword) => {
  await admin.auth().updateUser(uid, { password: newPassword });
};

module.exports = {
  createFirebaseUser,
  sendPasswordResetEmail,
  updateFirebasePassword,
};
