// Default category lists per workspace vertical — mirror of
// Backend/constants/workspaceDefaults.js. Single source of truth in the
// frontend for what a freshly-created workspace of each type ships with, and
// for the "suggested categories" CTA that detects missing standards.
//
// Adding a new vertical: add it here AND in the backend constants file (the
// route layer enforces the canonical list, not the frontend).

import type { Category, WorkspaceType, WorkspaceFeatures, BudgetBucket } from '../types';
import { DEFAULT_WORKSPACE_TYPE, BUDGET_BUCKETS, DEFAULT_BUCKET } from '../types';

const WEDDING_DEFAULTS: Category[] = [
  // Most-used core
  { name: 'Venue', icon: '🏛️' },
  { name: 'Catering', icon: '🍽️' },
  { name: 'Decoration', icon: '💐' },
  { name: 'Photography', icon: '📸' },
  { name: 'Outfits', icon: '👗' },
  { name: 'Jewelry', icon: '💍' },
  { name: 'Music & DJ', icon: '🎵' },
  { name: 'Makeup & Beauty', icon: '💄' },
  // Pre-wedding ceremonies
  { name: 'Mehendi', icon: '🌿' },
  { name: 'Sangeet', icon: '💃' },
  { name: 'Haldi', icon: '🌼' },
  { name: 'Priest & Pooja', icon: '🪔' },
  // Logistics
  { name: 'Transport', icon: '🚗' },
  { name: 'Invitations', icon: '💌' },
  { name: 'Sweets', icon: '🍬' },
  { name: 'Gifts', icon: '🎁' },
  { name: 'Accommodation', icon: '🏨' },
  // Post-wedding
  { name: 'Reception', icon: '🎊' },
  { name: 'Honeymoon', icon: '✈️' },
  // Catch-all
  { name: 'Miscellaneous', icon: '📦' },
];

const TRIP_DEFAULTS: Category[] = [
  { name: 'Flights', icon: '✈️' },
  { name: 'Trains', icon: '🚆' },
  { name: 'Hotel / Stay', icon: '🏨' },
  { name: 'Local Transport', icon: '🚕' },
  { name: 'Food & Drinks', icon: '🍴' },
  { name: 'Activities', icon: '🎟️' },
  { name: 'Shopping', icon: '🛍️' },
  { name: 'SIM / Data', icon: '📶' },
  { name: 'Visas / Docs', icon: '📄' },
  { name: 'Insurance', icon: '🛡️' },
  { name: 'Miscellaneous', icon: '📦' },
];

// Personal defaults are tagged with L0 buckets per the 50/30/20 framework.
// MIRROR of PERSONAL_DEFAULTS in Backend/constants/workspaceDefaults.js —
// keep the two in sync (backend is canonical at workspace-create time; this
// copy drives the "suggested categories" CTA on the frontend).
const PERSONAL_DEFAULTS: Category[] = [
  { name: 'Rent', icon: '🏠', bucket: 'need' },
  { name: 'Groceries', icon: '🛒', bucket: 'need' },
  { name: 'Eating Out', icon: '🍔', bucket: 'want' },
  { name: 'Transport', icon: '🚇', bucket: 'need' },
  { name: 'Utilities', icon: '💡', bucket: 'need' },
  { name: 'Subscriptions', icon: '🎬', bucket: 'want' },
  { name: 'Health', icon: '💊', bucket: 'need' },
  { name: 'Shopping', icon: '🛍️', bucket: 'want' },
  { name: 'Investments', icon: '📈', bucket: 'saving' },
  { name: 'EMIs / Loans', icon: '🏦', bucket: 'need' },
  { name: 'Personal Care', icon: '💆', bucket: 'need' },
  { name: 'Entertainment', icon: '🎮', bucket: 'want' },
  { name: 'Miscellaneous', icon: '📦', bucket: 'want' },
];

export const DEFAULT_CATEGORIES_BY_TYPE: Record<WorkspaceType, Category[]> = {
  wedding: WEDDING_DEFAULTS,
  trip: TRIP_DEFAULTS,
  personal: PERSONAL_DEFAULTS,
};

/**
 * Resolve the seeded default category list for a workspace type. Falls back to
 * wedding defaults so legacy callers (which never passed a type) keep working.
 */
export function getDefaultCategories(type?: WorkspaceType): Category[] {
  return DEFAULT_CATEGORIES_BY_TYPE[type ?? DEFAULT_WORKSPACE_TYPE]
    ?? DEFAULT_CATEGORIES_BY_TYPE[DEFAULT_WORKSPACE_TYPE];
}

/**
 * Backwards-compatible alias for callers that don't yet know about workspace
 * types. Returns the wedding defaults — same as the original export.
 */
export const DEFAULT_CATEGORIES: Category[] = WEDDING_DEFAULTS;

/**
 * Compute which canonical defaults for a given workspace type are missing
 * from a workspace's current category list. Case-insensitive name match —
 * handles admin custom categories with different casing.
 *
 * The `type` parameter is optional; legacy callers (Settings.tsx pre-Phase-0a)
 * pass nothing and get the wedding defaults, which is what they expect.
 */
export function getMissingDefaults(
  currentCategories: Category[] | undefined | null,
  type?: WorkspaceType
): Category[] {
  const defaults = getDefaultCategories(type);
  if (!Array.isArray(currentCategories)) return defaults;
  const present = new Set(
    currentCategories.map((c) => (c.name || '').toLowerCase().trim())
  );
  return defaults.filter((d) => !present.has(d.name.toLowerCase()));
}

/**
 * Per-type feature flag matrix. Mirror of FEATURES_BY_TYPE in
 * Backend/constants/workspaceDefaults.js — keep the two in sync. The backend
 * is the canonical source; this client copy is used as a fallback when the
 * server response doesn't include `wedding.features` (older cached payloads,
 * legacy endpoints).
 */
export const FEATURES_BY_TYPE: Record<WorkspaceType, WorkspaceFeatures> = {
  wedding: {
    joinCode: true,
    multiMember: true,
    settlement: false,
    monthlyBudget: false,
    recurring: false,
    income: false,
    topContributors: true,
  },
  trip: {
    joinCode: true,
    multiMember: true,
    settlement: true,
    monthlyBudget: false,
    recurring: false,
    income: false,
    topContributors: true,
  },
  personal: {
    joinCode: false,
    multiMember: false,
    settlement: false,
    monthlyBudget: true,
    recurring: true,
    income: true,
    topContributors: false,
  },
};

/**
 * Resolve the feature flag set for a workspace type. Falls back to wedding
 * features for unknown / undefined types (defensive — never returns undefined).
 */
export function getFeaturesByType(type?: WorkspaceType): WorkspaceFeatures {
  return FEATURES_BY_TYPE[type ?? DEFAULT_WORKSPACE_TYPE]
    ?? FEATURES_BY_TYPE[DEFAULT_WORKSPACE_TYPE];
}

// ── L0: Need/Want/Saving helpers ────────────────────────────────────────────

/**
 * Look up the canonical default bucket for a category NAME, for the given
 * workspace type. Used to seed the bucket when the user adds a category in
 * Settings whose name matches a canonical Personal default (e.g. the admin
 * re-adds "Groceries" after deleting it). Case-insensitive.
 *
 * Returns DEFAULT_BUCKET ('want') if the name doesn't match any canonical
 * Personal default, or for non-monthlyBudget verticals.
 */
export function getDefaultBucketFor(
  categoryName: string,
  type?: WorkspaceType
): BudgetBucket {
  if (!categoryName) return DEFAULT_BUCKET;
  const defaults = getDefaultCategories(type);
  const target = categoryName.toLowerCase().trim();
  const match = defaults.find((c) => c.name.toLowerCase() === target);
  return match?.bucket ?? DEFAULT_BUCKET;
}

/**
 * Resolve a category's bucket safely. Returns the stored bucket if it's one
 * of the canonical values, else falls back to DEFAULT_BUCKET ('want'). This
 * is the FIRST callable any UI should use to read `category.bucket` — direct
 * field reads would surface `undefined` on legacy pre-L0 categories.
 */
export function resolveBucket(category: Pick<Category, 'bucket'> | undefined | null): BudgetBucket {
  const b = category?.bucket;
  return b && (BUDGET_BUCKETS as readonly string[]).includes(b) ? b : DEFAULT_BUCKET;
}

/**
 * Aggregate spend totals per bucket given:
 *   • the list of categories (with their bucket assignments), and
 *   • a category → total-spent map (e.g. derived from summary.categoryBreakdown).
 *
 * Unknown categories (in the breakdown but not in the workspace's categories)
 * are bucketed as DEFAULT_BUCKET — they came from an expense whose category
 * the admin later deleted; surfacing them in "want" is the least-surprising
 * default and prevents silent data loss in the score.
 */
export function aggregateSpendByBucket(
  categories: Category[],
  spendByCategory: Record<string, number>
): Record<BudgetBucket, number> {
  const result: Record<BudgetBucket, number> = { need: 0, want: 0, saving: 0 };
  const bucketByName = new Map<string, BudgetBucket>();
  for (const c of categories) {
    bucketByName.set(c.name.toLowerCase(), resolveBucket(c));
  }
  for (const [name, total] of Object.entries(spendByCategory)) {
    const bucket = bucketByName.get((name || '').toLowerCase()) ?? DEFAULT_BUCKET;
    result[bucket] += Math.max(0, total);
  }
  return result;
}

export interface BudgetScoreResult {
  /** 0-100 score; higher = closer to target allocation. */
  score: number;
  /** Actual spending split as integer percentages summing to ~100. */
  actualPct: Record<BudgetBucket, number>;
  /** Per-bucket signed deviation from target (actual_pct − target_pct). */
  deltaPct: Record<BudgetBucket, number>;
  /** True if the user has effectively zero spending in the period. */
  isEmpty: boolean;
}

/**
 * Compute the Budget Score for a period given the user's TARGET allocation
 * and ACTUAL bucket spending.
 *
 *   score = 100 − Σ |actual_pct − target_pct|, clamped to [0, 100]
 *
 * Example: target {50, 30, 20}, actual {65, 25, 10}
 *          diffs {+15, −5, −10}, |sum| 30 → score 70
 *
 * Edge cases handled:
 *   • totalSpent === 0  → score = 100 (perfect — no deviation possible).
 *                          isEmpty=true so callers can render a hint instead
 *                          of a misleading "you nailed your budget" message.
 *   • allocation undefined → uses DEFAULT_BUDGET_ALLOCATION
 *   • actual sums to non-100 due to rounding → final %s are recomputed from
 *                          ratios (no drift even if upstream caller rounded)
 *   • negative bucket totals (shouldn't happen) → clamped to 0 by
 *                          aggregateSpendByBucket
 */
export function computeBudgetScore(
  spendByBucket: Record<BudgetBucket, number>,
  allocation: { need: number; want: number; saving: number } | undefined
): BudgetScoreResult {
  const target = allocation && Number.isFinite(allocation.need)
    ? allocation
    : { need: 50, want: 30, saving: 20 };

  const total = spendByBucket.need + spendByBucket.want + spendByBucket.saving;

  if (total <= 0) {
    return {
      score: 100,
      actualPct: { need: 0, want: 0, saving: 0 },
      deltaPct: { need: -target.need, want: -target.want, saving: -target.saving },
      isEmpty: true,
    };
  }

  const rawPct: Record<BudgetBucket, number> = {
    need: (spendByBucket.need / total) * 100,
    want: (spendByBucket.want / total) * 100,
    saving: (spendByBucket.saving / total) * 100,
  };

  // Round to integers for display, but keep raw float for delta math so we
  // don't double-count rounding error in the score itself.
  const actualPct: Record<BudgetBucket, number> = {
    need: Math.round(rawPct.need),
    want: Math.round(rawPct.want),
    saving: Math.round(rawPct.saving),
  };

  const deltaPct: Record<BudgetBucket, number> = {
    need: actualPct.need - target.need,
    want: actualPct.want - target.want,
    saving: actualPct.saving - target.saving,
  };

  // Score uses raw (unrounded) deviations so a perfect 50/30/20 split that
  // gets rounded to 49/30/21 still scores 100, not 98.
  const rawDeviation =
    Math.abs(rawPct.need - target.need) +
    Math.abs(rawPct.want - target.want) +
    Math.abs(rawPct.saving - target.saving);

  const score = Math.max(0, Math.min(100, Math.round(100 - rawDeviation)));

  return { score, actualPct, deltaPct, isEmpty: false };
}
