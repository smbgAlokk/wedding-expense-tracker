const pino = require('pino');

// Structured logging (Security audit §14.G). Replaces ad-hoc console.* with a
// single JSON logger. Redaction strips secrets from request/response objects so
// tokens, cookies, and passwords never reach the log sink.
//
// Output format: raw JSON in production (log aggregators parse it), a
// human-readable terminal layout in development (utils/devLogFormat.js).
// LOG_FORMAT=json|pretty overrides the default either way.
const isProd = process.env.NODE_ENV === 'production';
const format = (process.env.LOG_FORMAT || (isProd ? 'json' : 'pretty')).toLowerCase();

const options = {
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
};

const logger = format === 'pretty'
  ? pino(options, require('./devLogFormat').createDevStream())
  : pino(options);

// Lean request/response shapes for pino-http. Full header dumps (CSP, HSTS,
// rate-limit, etags…) are identical on every line and drown the signal; the
// correlation id + method + url + status is what incident triage needs.
const httpSerializers = {
  req: (req) => ({
    id: req.id,
    method: req.method,
    url: req.url,
    remoteAddress: req.remoteAddress,
    userAgent: req.headers && req.headers['user-agent'],
  }),
  res: (res) => ({ statusCode: res.statusCode }),
};

module.exports = { logger, httpSerializers };
