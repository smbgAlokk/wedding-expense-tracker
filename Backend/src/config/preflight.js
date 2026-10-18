// Boot-time preflight checks (Security audit §14.G — P-2, P-3).
//
// Fail fast and loud rather than ship a known-broken runtime. checkEnv() guards
// required secrets in production; checkJoinCodeIndex() guards the sparse-index
// invariant that Personal-workspace creation depends on (audit P-3).

const boot = require('../utils/boot');

const REQUIRED_PROD_ENV = [
  'JWT_SECRET',
  'MONGODB_URI',
  'FRONTEND_URL',
  'GOOGLE_CLIENT_ID',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
];

// P-2: in production, refuse to boot if any required env var is missing. (Absorbs
// the previous inline SMTP-only check.) Dev is unaffected — missing values there
// just degrade individual features.
function checkEnv() {
  if (process.env.NODE_ENV !== 'production') {
    boot.step('Environment', 'info', `${process.env.NODE_ENV || 'development'} · production secret check skipped`);
    return;
  }
  const missing = REQUIRED_PROD_ENV.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
  if (missing.length) {
    boot.step('Environment', 'fail', `missing required env in production: ${missing.join(', ')}`);
    boot.abort('Startup aborted — refusing to start without required secrets');
    process.exit(1);
  }
  // HS256 signing key: anything short is brute-forceable offline from one token.
  if (process.env.JWT_SECRET.length < 32) {
    boot.step('Environment', 'fail', 'JWT_SECRET is too short (need ≥ 32 characters)', { hint: 'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"' });
    boot.abort('Startup aborted — weak JWT secret');
    process.exit(1);
  }
  boot.step('Environment', 'ok', `production · all ${REQUIRED_PROD_ENV.length} required secrets present`);
}

// P-3: the joinCode unique index MUST be sparse/partial, otherwise the second
// Personal workspace (joinCode: null) collides on the null key. Runs after the
// DB connection is up. Fatal in production only when a Personal workspace
// actually exists; a warning otherwise (and in dev).
async function checkJoinCodeIndex() {
  try {
    const Wedding = require('../models/Wedding');
    const indexes = await Wedding.collection.indexes();
    const jc = indexes.find((i) => i.key && i.key.joinCode === 1);
    const safe = jc && (jc.sparse || jc.partialFilterExpression);
    if (jc && !safe) {
      const hint = 'Run: node scripts/migrateWorkspaceIndexes.js';
      const personalCount = await Wedding.countDocuments({ type: 'personal' });
      if (process.env.NODE_ENV === 'production' && personalCount > 0) {
        boot.step('Indexes', 'fail', 'joinCode index is NOT sparse/partial and a Personal workspace exists', { hint });
        boot.abort('Startup aborted — index migration required');
        process.exit(1);
      } else {
        boot.step('Indexes', 'warn', `joinCode index is NOT sparse/partial — Personal signups will fail until migrated (${personalCount} Personal workspace(s))`, { hint });
      }
      return;
    }
    boot.step('Indexes', 'ok', jc ? 'joinCode index is sparse' : 'joinCode index not created yet');
  } catch (err) {
    boot.step('Indexes', 'skip', `joinCode index check skipped: ${err.message}`);
  }
}

module.exports = { checkEnv, checkJoinCodeIndex };
