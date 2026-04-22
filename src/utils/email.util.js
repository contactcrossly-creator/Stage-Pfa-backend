const nodemailer = require('nodemailer');

const canSendEmail = () =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.MAIL_FROM
  );

const sendUserCredentialsEmail = async ({ to, nom, temporaryPassword, role }) => {
  if (!canSendEmail()) {
    return {
      attempted: false,
      sent: false,
      reason: 'smtp_not_configured',
    };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: 'Your industrial platform account credentials',
    text: [
      `Bonjour ${nom},`,
      '',
      'Your account has been created.',
      `Role: ${role}`,
      `Temporary password: ${temporaryPassword}`,
      'You must change your password on first login.',
    ].join('\n'),
  });

  return {
    attempted: true,
    sent: true,
  };
};

module.exports = {
  sendUserCredentialsEmail,
};
