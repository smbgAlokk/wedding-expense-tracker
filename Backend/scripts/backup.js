#!/usr/bin/env node
/**
 * MongoDB backup (Security audit P-4, §14.G).
 *
 * Runs `mongodump` against MONGODB_URI into a timestamped gzipped archive, then
 * optionally uploads to S3 and prunes archives older than the retention window.
 * Designed to be cron-driven (e.g. nightly). S3 upload is ENV-GATED — without
 * S3 env vars it just writes a local archive (fine for manual/dev backups).
 *
 *   Local only:   node scripts/backup.js
 *   With S3:      set BACKUP_S3_BUCKET (+ AWS creds) and run the same command.
 *
 * Env:
 *   MONGODB_URI            (required)
 *   BACKUP_DIR             local output dir (default ./backups)
 *   BACKUP_RETENTION_DAYS  prune local archives older than N days (default 30)
 *   BACKUP_S3_BUCKET       optional S3 bucket (uses `aws s3 cp`; needs AWS CLI)
 *   BACKUP_S3_PREFIX       optional key prefix (default mongo-backups)
 *
 * Restore drill: see Backend/docs/BACKUP.md.
 */
require('dotenv').config();
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('[backup] MONGODB_URI is required'); process.exit(1); }

const outDir = path.resolve(process.env.BACKUP_DIR || './backups');
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 30);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const archive = path.join(outDir, `mongo-${stamp}.gz`);

fs.mkdirSync(outDir, { recursive: true });

try {
  console.log(`[backup] dumping → ${archive}`);
  execFileSync('mongodump', [`--uri=${URI}`, `--archive=${archive}`, '--gzip'], { stdio: 'inherit' });
} catch (err) {
  console.error('[backup] mongodump failed (is the MongoDB Database Tools / mongodump on PATH?):', err.message);
  process.exit(1);
}

if (process.env.BACKUP_S3_BUCKET) {
  const prefix = process.env.BACKUP_S3_PREFIX || 'mongo-backups';
  const dest = `s3://${process.env.BACKUP_S3_BUCKET}/${prefix}/${path.basename(archive)}`;
  try {
    console.log(`[backup] uploading → ${dest}`);
    execFileSync('aws', ['s3', 'cp', archive, dest], { stdio: 'inherit' });
  } catch (err) {
    console.error('[backup] S3 upload failed (is the AWS CLI configured?):', err.message);
    process.exit(1);
  }
}

// Prune local archives older than retentionDays.
try {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  for (const f of fs.readdirSync(outDir)) {
    if (!f.startsWith('mongo-') || !f.endsWith('.gz')) continue;
    const p = path.join(outDir, f);
    if (fs.statSync(p).mtimeMs < cutoff) { fs.unlinkSync(p); console.log(`[backup] pruned ${f}`); }
  }
} catch (err) {
  console.warn('[backup] prune step skipped:', err.message);
}

console.log('[backup] done.');
