// Default category lists per workspace vertical — mirror of
// Backend/constants/workspaceDefaults.js. Single source of truth in the
// frontend for what a freshly-created workspace of each type ships with, and
// for the "suggested categories" CTA that detects missing standards.
//
// Adding a new vertical: add it here AND in the backend constants file (the
// route layer enforces the canonical list, not the frontend).

import type { Category, WorkspaceType, WorkspaceFeatures } from '../types';
import { DEFAULT_WORKSPACE_TYPE } from '../types';

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

const PERSONAL_DEFAULTS: Category[] = [
  { name: 'Rent', icon: '🏠' },
  { name: 'Groceries', icon: '🛒' },
  { name: 'Eating Out', icon: '🍔' },
  { name: 'Transport', icon: '🚇' },
  { name: 'Utilities', icon: '💡' },
  { name: 'Subscriptions', icon: '🎬' },
  { name: 'Health', icon: '💊' },
  { name: 'Shopping', icon: '🛍️' },
  { name: 'Investments', icon: '📈' },
  { name: 'EMIs / Loans', icon: '🏦' },
  { name: 'Personal Care', icon: '💆' },
  { name: 'Entertainment', icon: '🎮' },
  { name: 'Miscellaneous', icon: '📦' },
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
