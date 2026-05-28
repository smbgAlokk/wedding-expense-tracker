#!/usr/bin/env node
/**
 * One-shot backfill for the email-verification rollout (Security audit H-5,
 * 2026-05-28).
 *
 * H-5 added `emailVerifiedAt` to Member. Existing prod members were created
 * before any verification flow existed; their inboxes were never asked to
 * confirm. Treating them as unverified after deploy would lock every current
 * admin out of password reset overnight (the H-5 gate refuses reset for
 * unverified members). They are GRANDFATHERED as verified by this script.
 *
 * Scope: Members with an email AND a password (i.e. local-auth accounts that
 * have actually been used) AND no existing emailVerifiedAt. Google-auth
 * members are handled by the /auth/google route's on-the-fly auto-verify
 * (their email is implicitly Google-verified). Passwordless members (regular
 * family members who joined via code with no email) have nothing to verify.
 *
 * Run once per environment AFTER deploying the H-5 code:
 *
 *     cd Backend && node scripts/backfillEmailVerified.js
 *
 * Idempotent — safe to run multiple times. Honours MONGODB_URI from .env.
 * Pass --dry-run to count without writing.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wedding-expense-tracker';
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`[backfill] Connecting to MongoDB (dry-run=${DRY_RUN})...`);
  await mongoose.connect(MONGODB_URI);
  console.log('[backfill] Connected.');

  const Member = require('../models/Member');

  // Match: has email, has password (i.e. local-auth user), not yet verified.
  // We select +password since it's normally hidden; the query needs it to
  // distinguish password-holders from Google-only / passwordless.
  const candidates = await Member.find({
    email: { $exists: true, $type: 'string', $ne: '' },
    emailVerifiedAt: null,
  }).select('+password');

  const eligible = candidates.filter((m) => !!m.password);
  console.log(`[backfill] Candidates with email + null emailVerifiedAt: ${candidates.length}`);
  console.log(`[backfill] Eligible (have a password — local-auth grandfathered): ${eligible.length}`);
  console.log(`[backfill] Skipped (Google-only, no password to grandfather): ${candidates.length - eligible.length}`);

  if (DRY_RUN) {
    console.log('[backfill] --dry-run: no writes performed.');
    await mongoose.disconnect();
    return;
  }

  if (eligible.length === 0) {
    console.log('[backfill] Nothing to backfill — done.');
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  const ids = eligible.map((m) => m._id);
  const result = await Member.updateMany(
    { _id: { $in: ids } },
    { $set: { emailVerifiedAt: now } }
  );
  console.log(`[backfill] ✅ Backfilled emailVerifiedAt on ${result.modifiedCount} member(s).`);

  // Sanity: zero remaining eligible after the write.
  const remaining = await Member.countDocuments({
    email: { $exists: true, $type: 'string', $ne: '' },
    emailVerifiedAt: null,
    password: { $exists: true, $ne: '' },
  });
  if (remaining > 0) {
    console.warn(`[backfill] ⚠️  ${remaining} eligible member(s) still unverified after backfill — re-run to retry.`);
  } else {
    console.log('[backfill] Verification: 0 eligible members remain unverified.');
  }

  await mongoose.disconnect();
  console.log('[backfill] Disconnected.');
}

main().catch(async (err) => {
  console.error('[backfill] Fatal error:', err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
