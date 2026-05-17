const { db } = require('../config/firebase.config');

const MAIL_COLLECTION = 'mail';

const sendEmail = async ({ to, subject, text, html }) => {
  await db.collection(MAIL_COLLECTION).add({
    to: Array.isArray(to) ? to : [to],
    message: {
      subject,
      text,
      html: html || text,
    },
  });
  return { sent: true, method: 'firebase_trigger_email' };
};

const sendCredentialsEmail = async ({ to, nom, temporaryPassword, role }) => {
  const text = [
    `Bonjour ${nom},`,
    '',
    'Your account has been created.',
    `Role: ${role}`,
    `Temporary password: ${temporaryPassword}`,
    'You must change your password on first login.',
    '',
    'Best regards,',
    'The Platform Team',
  ].join('\n');

  const html = [
    `<p>Bonjour <strong>${nom}</strong>,</p>`,
    '<p>Your account has been created.</p>',
    `<p><strong>Role:</strong> ${role}</p>`,
    `<p><strong>Temporary password:</strong> <code>${temporaryPassword}</code></p>`,
    '<p>You must change your password on first login.</p>',
    '<br>',
    '<p>Best regards,<br>The Platform Team</p>',
  ].join('\n');

  return sendEmail({
    to,
    subject: 'Your platform account credentials',
    text,
    html,
  });
};

module.exports = {
  sendEmail,
  sendCredentialsEmail,
};
