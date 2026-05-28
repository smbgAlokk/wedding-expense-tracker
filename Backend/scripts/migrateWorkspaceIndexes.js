#!/usr/bin/env node
/**
 * One-shot index migration for the multi-vertical Workspace abstraction.
 *
 * Phase 0a (2026-05-27) added `type: 'wedding' | 'trip' | 'personal'` to the
 * Wedding model and changed the `joinCode` schema option to `sparse: true`.
 * Personal workspaces have no joinCode — without a sparse index, the existing
 * production index would collide on the implicit `null` key the first time a
 * Personal workspace is created. Mongoose does NOT auto-drop+recreate an
 * existing index when only its options change, so this script does it manually.
 *
 * Run once per environment (local dev, staging, prod) BEFORE the first Personal
 * workspace is created:
 *
 *     cd Backend && node scripts/migrateWorkspaceIndexes.js
 *
 * Idempotent — safe to run multiple times. Honours MONGODB_URI from .env.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wedding-expense-tracker';

async function main() {
  console.log('[migrate] Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('[migrate] Connected.');

  const Wedding = require('../models/Wedding');
  const collection = Wedding.collection;

  // 1. List existing indexes and check joinCode.
  const indexes = await collection.indexes();
  const joinCodeIndex = indexes.find((i) => i.key && i.key.joinCode === 1);

  if (joinCodeIndex) {
    const isSparse = !!joinCodeIndex.sparse;
    const isUnique = !!joinCodeIndex.unique;
    console.log(`[migrate] Found joinCode index "${joinCodeIndex.name}" — unique=${isUnique}, sparse=${isSparse}`);

    if (isSparse) {
      console.log('[migrate] joinCode index already sparse — nothing to do.');
    } else {
      console.log(`[migrate] Dropping non-sparse index "${joinCodeIndex.name}"...`);
      await collection.dropIndex(joinCodeIndex.name);
      console.log('[migrate] Dropped.');
    }
  } else {
    console.log('[migrate] No joinCode index found.');
  }

  // 2. syncIndexes will create any indexes from the current schema that are
  //    missing — including the new sparse joinCode index — and prune ones the
  //    schema no longer declares.
  console.log('[migrate] Syncing indexes from schema...');
  const synced = await Wedding.syncIndexes();
  console.log('[migrate] syncIndexes result:', synced);

  // 3. Verify final state.
  const finalIndexes = await collection.indexes();
  const finalJoinCode = finalIndexes.find((i) => i.key && i.key.joinCode === 1);
  if (finalJoinCode) {
    console.log(`[migrate] Final joinCode index: name="${finalJoinCode.name}" unique=${!!finalJoinCode.unique} sparse=${!!finalJoinCode.sparse}`);
    if (!finalJoinCode.sparse) {
      console.error('[migrate] ❌ Expected sparse:true on joinCode index after migration — fix the schema and retry.');
      process.exitCode = 1;
    } else {
      console.log('[migrate] ✅ joinCode index is sparse — safe to create Personal workspaces.');
    }
  } else {
    console.warn('[migrate] ⚠️  No joinCode index present after sync — schema may have changed unexpectedly.');
  }

  await mongoose.disconnect();
  console.log('[migrate] Disconnected.');
}

main().catch(async (err) => {
  console.error('[migrate] Fatal error:', err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
