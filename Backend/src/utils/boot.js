// Startup reporter. Each boot phase is logged as a structured record tagged
// with `boot` — rendered as a step-by-step checklist by the dev formatter and
// kept as plain JSON lines (`{"boot":"step","step":"Database",...}`) in prod.

const { logger } = require('./logger');

const startedAt = Date.now();

const LEVEL_FOR_STATUS = { ok: 'info', info: 'info', pending: 'info', skip: 'info', warn: 'warn', fail: 'error' };

function banner({ service, version }) {
  logger.info(
    { boot: 'banner', service, version, node: process.version, env: process.env.NODE_ENV || 'development', pid: process.pid },
    `${service} v${version} starting`,
  );
}

// status: 'ok' | 'info' | 'pending' | 'skip' | 'warn' | 'fail'
function step(name, status, message, extra = {}) {
  logger[LEVEL_FOR_STATUS[status] || 'info']({ boot: 'step', step: name, status, ...extra }, message);
}

function ready({ url, origins }) {
  logger.info({ boot: 'ready', url, origins, bootMs: Date.now() - startedAt }, `Server ready at ${url}`);
}

function abort(message, hint) {
  logger.fatal({ boot: 'abort', hint }, message);
}

// Translate the common MongoDB connection failures into an actionable hint.
function mongoHint(err) {
  const msg = String((err && err.message) || '');
  if (/ENOTFOUND|querySrv|EREFUSED/i.test(msg)) {
    return 'Cluster host not found in DNS. Check the Atlas cluster is running (not paused/deleted) and MONGODB_URI is correct.';
  }
  if (/bad auth|Authentication failed/i.test(msg)) {
    return 'Database username/password in MONGODB_URI were rejected.';
  }
  if (/ECONNREFUSED/i.test(msg)) {
    return 'Nothing is listening at that address. Is MongoDB running?';
  }
  if (/whitelist|Could not connect to any servers|timed out|ETIMEDOUT|Server selection/i.test(msg)) {
    return 'Connection timed out. Add your current IP under Atlas → Network Access.';
  }
  return undefined;
}

// Host (and nothing else) from a Mongo URI — credentials must never be logged.
function mongoHost(uri) {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(String(uri || ''));
  return match ? match[1] : 'unknown host';
}

module.exports = { banner, step, ready, abort, mongoHint, mongoHost };
