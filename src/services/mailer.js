const nodemailer = require('nodemailer');
const config = require('../config');

// Without SMTP settings the message is printed to the console so the flow can be tested locally.
const transport = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

async function sendMail({ to, subject, text, html }) {
  if (!transport) {
    console.log(`[mail:dev] to=${to} subject="${subject}"\n${text}\n`);
    return;
  }
  await transport.sendMail({ from: config.mailFrom, to, subject, text, html });
}

module.exports = { sendMail };
