require('dotenv').config();

const config = {
  port: Number(process.env.PORT) || 3001,
  env: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`,
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  mailFrom: process.env.MAIL_FROM || 'Octopus Sports Academy <no-reply@octopus.local>',
  lateAfterMinutes: Number(process.env.LATE_AFTER_MINUTES) || 5,
  qrTokenTtlSeconds: 90,
  // Demo/testing only: lets people join classes without paying while no payment provider is connected.
  // Development always allows it; in production it must be switched on on purpose in .env.
  allowFreeEnrollment: process.env.ALLOW_FREE_ENROLLMENT === 'true',
};

// In production the login-cookie secret must be real: long, and not one of the example values.
// (Anyone who knows the secret can make a login cookie for any account, including admin.)
const EXAMPLE_SECRETS = ['dev-only-secret-change-me', 'change-me-to-a-long-random-string'];
if (config.env === 'production' && (EXAMPLE_SECRETS.includes(config.jwtSecret) || config.jwtSecret.length < 32)) {
  throw new Error('JWT_SECRET must be a long random value in production (see .env)');
}

module.exports = config;
