// Boot-time preflight checks (Security audit §14.G — P-2, P-3).
//
// Fail fast and loud rather than ship a known-broken runtime. checkEnv() guards
// required secrets in production; checkJoinCodeIndex() guards the sparse-index
// invariant that Personal-workspace creation depends on (audit P-3).

const REQUIRED_PROD_ENV = [
  'JWT_SECRET',
  'MONGODB_URI',
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
  if (process.env.NODE_ENV !== 'production') return;
  const missing = REQUIRED_PROD_ENV.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
  if (missing.length) {
    console.error(`[Preflight] FATAL: missing required env in production: ${missing.join(', ')}. Refusing to start.`);
    process.exit(1);
  }
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
      const base = '[Preflight] joinCode index is NOT sparse/partial. Run: node scripts/migrateWorkspaceIndexes.js';
      const personalCount = await Wedding.countDocuments({ type: 'personal' });
      if (process.env.NODE_ENV === 'production' && personalCount > 0) {
        console.error(`${base} A Personal workspace already exists — refusing to start.`);
        process.exit(1);
      } else {
        console.warn(`${base} (${personalCount} Personal workspace(s); non-fatal here, but Personal signups will fail until migrated)`);
      }
    }
  } catch (err) {
    console.warn('[Preflight] joinCode index check skipped:', err.message);
  }
}

module.exports = { checkEnv, checkJoinCodeIndex };
