// Sentry error monitoring (Security audit §14.G). DSN-GATED: with no SENTRY_DSN
// nothing is loaded or initialised, so dev / un-configured deploys are
// unaffected. PII is scrubbed in beforeSend (cookies, auth headers, request
// bodies, user email/ip) so we never ship secrets to Sentry.

let Sentry = null;

function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || String(dsn).trim() === '') return null;
  // Require lazily so the dependency is only loaded when actually configured.
  Sentry = require('@sentry/node');
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      return event;
    },
  });
  return Sentry;
}

function captureError(err) {
  if (Sentry) {
    try { Sentry.captureException(err); } catch { /* never let logging throw */ }
  }
}

module.exports = { initSentry, captureError };
