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
};

if (config.env === 'production' && config.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}

module.exports = config;
