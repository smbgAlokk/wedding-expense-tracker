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

// L0 — Need / Want / Saving budget bucket (Personal vertical only).
// Names are locked; the user customizes only the target allocation % on the
// workspace. Mirrors BUDGET_BUCKETS in Backend/constants/workspaceDefaults.js.
export type BudgetBucket = 'need' | 'want' | 'saving';

export const BUDGET_BUCKETS: readonly BudgetBucket[] = ['need', 'want', 'saving'] as const;

/**
 * Target spend allocation across the three buckets, as integer percentages
 * that must sum to exactly 100. Default 50/30/20 (the classic personal-
 * finance rule) is seeded on Personal workspace creation; users edit freely
 * via Settings. Wedding/Trip workspaces carry the schema default but never
 * surface it in their UI.
 */
export interface BudgetAllocation {
  need: number;
  want: number;
  saving: number;
}

export const DEFAULT_BUDGET_ALLOCATION: BudgetAllocation = { need: 50, want: 30, saving: 20 };

/** Fallback bucket when a category has none set (legacy categories or user-added customs). */
export const DEFAULT_BUCKET: BudgetBucket = 'want';

export interface Category {
  name: string;
  icon: string;
  budgetLimit?: number;
  // L0 — bucket assignment. Optional because:
  //   • Wedding/Trip categories never have one (UI ignores it for those types)
  //   • Personal categories created before L0 don't have one stored
  // Consumers should use `resolveBucket(cat)` (defaultCategories.ts) instead
  // of reading the field directly so the DEFAULT_BUCKET fallback is applied.
  bucket?: BudgetBucket;
}

export interface Member {
  _id: string;
  name: string;
  email?: string;
  role: 'admin' | 'member';
  relation?: string;
  joinedAt?: string;
  createdAt?: string;
  // L3 — AI Coach opt-in + waitlist flags. Both default false on the
  // server; the frontend reads them via /api/ai/coach/status so most
  // consumers don't need to touch the Member object directly.
  aiCoachEnabled?: boolean;
  aiWaitlistJoined?: boolean;
}

// L3 — AI Coach status response shape (returned by GET /api/ai/coach/status).
export interface AICoachQuotaWindow {
  date?: string;
  month?: string;
  used: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
}
export interface AICoachStatus {
  configured: boolean;
  enabled: boolean;
  waitlistJoined: boolean;
  quota: {
    daily: AICoachQuotaWindow;
    monthly: AICoachQuotaWindow;
    anyExceeded: boolean;
  };
  model?: string;
  maxQuestionLength?: number;
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
  // Optional pay-cycle anchor for monthly-budget verticals (Personal). When
  // set, the Dashboard surfaces a "Until next payday" runway tile. 1–31 or
  // null. Clamped client-side to the last day of months that are shorter.
  payDay?: number | null;
  // L0 — Need / Want / Saving target allocation. Always present in fresh
  // workspaces (schema default); may be undefined on legacy pre-L0 documents
  // until the next admin save persists the default. Consumers should fall
  // back to DEFAULT_BUDGET_ALLOCATION if undefined.
  budgetAllocation?: BudgetAllocation;
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
//
// Security audit C-2 full migration (§14.F): the session JWT is no longer
// returned in the body — it's set as an HttpOnly cookie by the server. There is
// deliberately NO `token` field here; the client never sees the access token.
export interface AuthResult {
  member?: Member;
  wedding?: Wedding;
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
  dailyTrend?: Array<{ _id: string; total: number; count: number }>;
}

export interface PaginationMeta {
  total: number;
  page: number;
  pages: number;
  limit: number;
}
