// Core Business Models for the multi-vertical expense tracker.
//
// The Wedding model is the underlying storage container for every vertical —
// Wedding, Trip, Personal (see MASTER_CONTEXT.md §9). The `type` discriminator
// selects per-vertical default categories and the `features` flag set governs
// which UI sections render. Keep this in sync with
// Backend/constants/workspaceDefaults.js (canonical source of truth for the
// type list, defaults, and features).

export type WorkspaceType = 'wedding' | 'trip' | 'personal';

export const WORKSPACE_TYPES: readonly WorkspaceType[] = ['wedding', 'trip', 'personal'] as const;

export const DEFAULT_WORKSPACE_TYPE: WorkspaceType = 'wedding';

/**
 * Feature flag matrix per workspace type. The UI consults these to gate
 * sections instead of scattering `if (type === 'wedding')` across pages.
 * Mirrors FEATURES_BY_TYPE in Backend/constants/workspaceDefaults.js.
 *
 *   joinCode        — wedding-style 6-char code + Join page
 *   multiMember     — members list, "Added by" column, top contributors
 *   settlement      — "who owes whom" (Trip Phase 3)
 *   monthlyBudget   — month switcher, expenses bucketed by calendar month
 *   recurring       — recurring-expense templates (Personal Phase 4)
 *   income          — income direction on Expense + net cashflow (Personal Phase 4)
 *   topContributors — Dashboard "Top Contributors" leaderboard
 */
export interface WorkspaceFeatures {
  joinCode: boolean;
  multiMember: boolean;
  settlement: boolean;
  monthlyBudget: boolean;
  recurring: boolean;
  income: boolean;
  topContributors: boolean;
}

export interface Category {
  name: string;
  icon: string;
  budgetLimit?: number;
}

export interface Member {
  _id: string;
  name: string;
  email?: string;
  role: 'admin' | 'member';
  relation?: string;
  joinedAt?: string;
  createdAt?: string;
}

export interface Wedding {
  _id: string;
  // Vertical discriminator. Older wedding documents created before Phase 0a
  // (2026-05-27) may not have this field — treat undefined as 'wedding'.
  type?: WorkspaceType;
  // Server-computed feature flags. Optional because legacy responses may omit
  // them; consumers should fall back to deriving features from `type`.
  features?: WorkspaceFeatures;
  name: string;
  weddingName?: string;
  coupleNames?: { partner1: string; partner2: string };
  partner1: string;
  partner2: string;
  weddingDate: string;
  totalBudget?: number;
  currency: string;
  joinCode: string;
  categories: Category[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Expense {
  _id: string;
  weddingId: string | Wedding;
  memberId: Member; // Can be populated
  amount: number;
  category: string;
  description?: string;
  vendor?: string;
  receiptUrl?: string;
  receiptPublicId?: string;
  createdAt: string;
  updatedAt?: string;
}

// API Responses
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

// One option in the multi-wedding picker (one email → several weddings).
// Security audit H-1 (2026-05-28): joinCode is no longer included in the
// multi-wedding response — leaking every workspace's code to anyone who can
// guess one password is an unnecessary trust expansion. The selector token
// (see AuthResult.selectorToken) is the new attestation that the caller may
// turn a memberId into a session.
export interface WeddingOption {
  memberId: string;
  weddingName: string;
  role: 'admin' | 'member';
}

// Payload returned by the auth/wedding endpoints (login, google, create, join,
// select). Either a single authenticated session, or a multi-wedding choice.
//
// Security audit C-1 (2026-05-28): when multipleWeddings is true, the server
// also mints a short-lived (5-min) `selectorToken` that the client MUST replay
// to /auth/login/select-wedding. Without it the select endpoint returns 401 —
// closing the previous account-takeover hole.
export interface AuthResult {
  member?: Member;
  wedding?: Wedding;
  token?: string;
  message?: string;
  multipleWeddings?: boolean;
  weddings?: WeddingOption[];
  selectorToken?: string;
}

export interface ExpenseSummary {
  totalSpent: number;
  totalBudget?: number;
  budgetUsedPercent?: number;
  remaining?: number;
  totalCount?: number;
  currency?: string;
  categoryBreakdown: Array<{ _id: string; total: number; count: number }>;
  memberBreakdown: Array<{
    _id: string;
    total: number;
    count: number;
    name: string;
    relation: string;
  }>;
  recentExpenses?: Expense[];
}

export interface PaginationMeta {
  total: number;
  page: number;
  pages: number;
  limit: number;
}
