const nodemailer = require('nodemailer');
const config = require('../config');

// Without SMTP settings the message is printed to the console so the flow can be tested locally.
// Port 465 = TLS from the start; port 587 = plain start upgraded with STARTTLS (required, never sent in clear).
// Time limits keep a slow or unreachable mail server from holding a sign-up request open.
const transport = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      requireTLS: config.smtp.port !== 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    })
  : null;

// Throws if the message could not be handed to the mail server; callers decide what to tell the person.
async function sendMail({ to, subject, text, html }) {
  if (!transport) {
    console.log(`[mail:dev] to=${to} subject="${subject}"\n${text}\n`);
    return;
  }
  try {
    await transport.sendMail({ from: config.mailFrom, to, subject, text, html });
  } catch (err) {
    // Never log the password; the SMTP error text says what went wrong (wrong app password, blocked, timeout...)
    console.error(`[mail] could not send "${subject}" to ${to}:`, err.message);
    throw err;
  }
}

// Called once at start-up: tells us in the logs straight away if the SMTP settings are wrong
async function checkMailSettings() {
  if (!transport) {
    console.log('[mail] no SMTP settings: emails are printed in the logs (test mode)');
    return;
  }
  try {
    await transport.verify();
    console.log(`[mail] SMTP ready (${config.smtp.host}:${config.smtp.port} as ${config.smtp.user})`);
  } catch (err) {
    console.error(`[mail] SMTP settings do not work (${config.smtp.host}:${config.smtp.port}):`, err.message);
  }
}

module.exports = { sendMail, checkMailSettings };
