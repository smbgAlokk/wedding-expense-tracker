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

const PERSONAL_DEFAULTS = [
  { name: 'Rent', icon: '🏠', budgetLimit: 0 },
  { name: 'Groceries', icon: '🛒', budgetLimit: 0 },
  { name: 'Eating Out', icon: '🍔', budgetLimit: 0 },
  { name: 'Transport', icon: '🚇', budgetLimit: 0 },
  { name: 'Utilities', icon: '💡', budgetLimit: 0 },
  { name: 'Subscriptions', icon: '🎬', budgetLimit: 0 },
  { name: 'Health', icon: '💊', budgetLimit: 0 },
  { name: 'Shopping', icon: '🛍️', budgetLimit: 0 },
  { name: 'Investments', icon: '📈', budgetLimit: 0 },
  { name: 'EMIs / Loans', icon: '🏦', budgetLimit: 0 },
  { name: 'Personal Care', icon: '💆', budgetLimit: 0 },
  { name: 'Entertainment', icon: '🎮', budgetLimit: 0 },
  { name: 'Miscellaneous', icon: '📦', budgetLimit: 0 },
];

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

module.exports = {
  DEFAULT_CATEGORIES_BY_TYPE,
  FEATURES_BY_TYPE,
  WORKSPACE_TYPES,
  DEFAULT_WORKSPACE_TYPE,
  getDefaultCategories,
  getFeatures,
};
