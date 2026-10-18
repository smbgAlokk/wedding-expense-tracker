/**
 * Workspace defaults — single source of truth for per-vertical configuration.
 *
 * The Wedding model is the underlying storage container for every vertical
 * (Wedding, Trip, Personal — see MASTER_CONTEXT.md §9 for the multi-vertical
 * plan). The `type` discriminator on each document selects which default
 * category list and feature flag set apply.
 *
 * Mirror this file with Frontend/src/constants/defaultCategories.ts. The
 * categories below are what a freshly-created workspace of each type is seeded
 * with by Wedding.js pre('save'); the feature flags below are what the UI
 * consults to decide which sections to render (members page, join code, month
 * switcher, settlement view, etc.) for a workspace of that type.
 *
 * Adding a new vertical (e.g., 'household'):
 *   1. Add an entry under DEFAULT_CATEGORIES_BY_TYPE with the new vertical's
 *      seeded categories.
 *   2. Add a matching entry under FEATURES_BY_TYPE.
 *   3. Mirror the same in Frontend/src/constants/defaultCategories.ts.
 *   4. Add translation keys under workspace.<type>.* in translations.ts.
 *   5. Add the type to the enum in Backend/models/Wedding.js.
 */

const WEDDING_DEFAULTS = [
  // Most-used core categories first
  { name: 'Venue', icon: '🏛️', budgetLimit: 0 },
  { name: 'Catering', icon: '🍽️', budgetLimit: 0 },
  { name: 'Decoration', icon: '💐', budgetLimit: 0 },
  { name: 'Photography', icon: '📸', budgetLimit: 0 },
  { name: 'Outfits', icon: '👗', budgetLimit: 0 },
  { name: 'Jewelry', icon: '💍', budgetLimit: 0 },
  { name: 'Music & DJ', icon: '🎵', budgetLimit: 0 },
  { name: 'Makeup & Beauty', icon: '💄', budgetLimit: 0 },
  // Pre-wedding ceremonies (cultural staples)
  { name: 'Mehendi', icon: '🌿', budgetLimit: 0 },
  { name: 'Sangeet', icon: '💃', budgetLimit: 0 },
  { name: 'Haldi', icon: '🌼', budgetLimit: 0 },
  { name: 'Priest & Pooja', icon: '🪔', budgetLimit: 0 },
  // Logistics
  { name: 'Transport', icon: '🚗', budgetLimit: 0 },
  { name: 'Invitations', icon: '💌', budgetLimit: 0 },
  { name: 'Sweets', icon: '🍬', budgetLimit: 0 },
  { name: 'Gifts', icon: '🎁', budgetLimit: 0 },
  { name: 'Accommodation', icon: '🏨', budgetLimit: 0 },
  // Post-wedding
  { name: 'Reception', icon: '🎊', budgetLimit: 0 },
  { name: 'Honeymoon', icon: '✈️', budgetLimit: 0 },
  // Catch-all
  { name: 'Miscellaneous', icon: '📦', budgetLimit: 0 },
];

const TRIP_DEFAULTS = [
  { name: 'Flights', icon: '✈️', budgetLimit: 0 },
  { name: 'Trains', icon: '🚆', budgetLimit: 0 },
  { name: 'Hotel / Stay', icon: '🏨', budgetLimit: 0 },
  { name: 'Local Transport', icon: '🚕', budgetLimit: 0 },
  { name: 'Food & Drinks', icon: '🍴', budgetLimit: 0 },
  { name: 'Activities', icon: '🎟️', budgetLimit: 0 },
  { name: 'Shopping', icon: '🛍️', budgetLimit: 0 },
  { name: 'SIM / Data', icon: '📶', budgetLimit: 0 },
  { name: 'Visas / Docs', icon: '📄', budgetLimit: 0 },
  { name: 'Insurance', icon: '🛡️', budgetLimit: 0 },
  { name: 'Miscellaneous', icon: '📦', budgetLimit: 0 },
];

// Personal-vertical defaults are tagged with a `bucket` per the L0
// (Need/Want/Saving) framework. The 50/30/20 rule from personal finance:
//   • Need   — essentials you can't easily skip (shelter, food, transit, debt)
//   • Want   — discretionary lifestyle spending (dining out, subs, shopping)
//   • Saving — wealth building (investments). EMIs are intentionally a Need
//              because they're obligations, not optional savings.
// Wedding/Trip categories don't ship buckets — buckets are a monthly-budget
// vertical concept. The Wedding schema's `bucket` field defaults to undefined
// for those categories and is ignored by the UI gates.
const PERSONAL_DEFAULTS = [
  { name: 'Rent', icon: '🏠', budgetLimit: 0, bucket: 'need' },
  { name: 'Groceries', icon: '🛒', budgetLimit: 0, bucket: 'need' },
  { name: 'Eating Out', icon: '🍔', budgetLimit: 0, bucket: 'want' },
  { name: 'Transport', icon: '🚇', budgetLimit: 0, bucket: 'need' },
  { name: 'Utilities', icon: '💡', budgetLimit: 0, bucket: 'need' },
  { name: 'Subscriptions', icon: '🎬', budgetLimit: 0, bucket: 'want' },
  { name: 'Health', icon: '💊', budgetLimit: 0, bucket: 'need' },
  { name: 'Shopping', icon: '🛍️', budgetLimit: 0, bucket: 'want' },
  { name: 'Investments', icon: '📈', budgetLimit: 0, bucket: 'saving' },
  { name: 'EMIs / Loans', icon: '🏦', budgetLimit: 0, bucket: 'need' },
  { name: 'Personal Care', icon: '💆', budgetLimit: 0, bucket: 'need' },
  { name: 'Entertainment', icon: '🎮', budgetLimit: 0, bucket: 'want' },
  { name: 'Miscellaneous', icon: '📦', budgetLimit: 0, bucket: 'want' },
];

// L0 — budget buckets that monthly-budget verticals (Personal) use to score
// alignment with the user's target allocation. Names are LOCKED (industry
// 50/30/20 framework); percentages are USER-customizable on the workspace.
const BUDGET_BUCKETS = ['need', 'want', 'saving'];

// Default allocation when a Personal workspace is created. The classic
// 50/30/20 rule. Users can change this freely in Settings; sum must === 100.
const DEFAULT_BUDGET_ALLOCATION = { need: 50, want: 30, saving: 20 };

// Default bucket for a category that doesn't have one set (legacy categories
// created before L0, or user-added customs). 'want' is the safest default —
// surfaces in the discretionary bucket where the user is most likely to want
// to review and re-bucket them.
const DEFAULT_BUCKET = 'want';

const DEFAULT_CATEGORIES_BY_TYPE = {
  wedding: WEDDING_DEFAULTS,
  trip: TRIP_DEFAULTS,
  personal: PERSONAL_DEFAULTS,
};

/**
 * Feature flag matrix per workspace type. The UI checks these to conditionally
 * render entire sections instead of scattering `if (type === 'wedding')` across
 * pages. New flags should default to `false` for verticals that haven't opted
 * in, so adding a flag never silently enables it elsewhere.
 *
 *   joinCode        — wedding-style 6-char code + Join page
 *   multiMember     — members list, "Added by" column, top contributors
 *   settlement      — "who owes whom" + min-transactions (Trip Phase 3)
 *   monthlyBudget   — month switcher, expenses bucketed by calendar month
 *   recurring       — recurring-expense templates (Personal Phase 4)
 *   income          — income direction on Expense + net cashflow (Personal Phase 4)
 *   topContributors — Dashboard "Top Contributors" leaderboard
 */
const FEATURES_BY_TYPE = {
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

const WORKSPACE_TYPES = Object.keys(DEFAULT_CATEGORIES_BY_TYPE);
const DEFAULT_WORKSPACE_TYPE = 'wedding';

/**
 * Resolve the default category list for a given workspace type. Falls back to
 * wedding defaults for unknown types (defensive — never returns undefined).
 */
function getDefaultCategories(type) {
  return DEFAULT_CATEGORIES_BY_TYPE[type] || DEFAULT_CATEGORIES_BY_TYPE[DEFAULT_WORKSPACE_TYPE];
}

/**
 * Resolve the feature flag set for a given workspace type. Falls back to
 * wedding features for unknown types.
 */
function getFeatures(type) {
  return FEATURES_BY_TYPE[type] || FEATURES_BY_TYPE[DEFAULT_WORKSPACE_TYPE];
}

/**
 * L0 — resolve a category's bucket. Returns the stored bucket if valid;
 * falls back to DEFAULT_BUCKET for legacy categories created before L0 or
 * for any unrecognised value. Never throws; always returns one of
 * BUDGET_BUCKETS.
 */
function resolveBucket(category) {
  const b = category && category.bucket;
  return BUDGET_BUCKETS.includes(b) ? b : DEFAULT_BUCKET;
}

module.exports = {
  DEFAULT_CATEGORIES_BY_TYPE,
  FEATURES_BY_TYPE,
  WORKSPACE_TYPES,
  DEFAULT_WORKSPACE_TYPE,
  BUDGET_BUCKETS,
  DEFAULT_BUDGET_ALLOCATION,
  DEFAULT_BUCKET,
  getDefaultCategories,
  getFeatures,
  resolveBucket,
};
