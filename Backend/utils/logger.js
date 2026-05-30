const pino = require('pino');

// Structured logging (Security audit §14.G). Replaces ad-hoc console.* with a
// single JSON logger. Redaction strips secrets from request/response objects so
// tokens, cookies, and passwords never reach the log sink.
const isProd = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.refreshToken',
      '*.turnstileToken',
      '*.selectorToken',
    ],
    remove: false,
  },
});

module.exports = { logger };
