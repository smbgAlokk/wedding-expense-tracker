// L2 — Smart Insights rule engine.
//
// Pure functions over the /analytics response. No side effects, no API
// calls, no DOM access. Every rule is a function `(input, ctx) => Insight |
// null`; the orchestrator runs them, drops nulls, dismisses filtered-out
// IDs, and sorts by severity + priority.
//
// DESIGN PRINCIPLES
// ─────────────────
//
// 1. Deterministic. Same input → same output. Easy to test, easy to reason
//    about, easy to add to.
//
// 2. Noise-floor on every rule. Tiny absolute deltas (< ₹500) never emit,
//    even if the % is huge. Cold-start users (no prev data) silently skip
//    rules that need comparison.
//
// 3. Each rule has a STABLE ID baked into the Insight. Dismissal is keyed
//    by ID — never by free-text body — so editing copy doesn't un-dismiss
//    a user's already-dismissed cards.
//
// 4. Localization happens HERE (rules build their own translated copy via
//    the t() function passed in). UI just renders. Means a rule can drop
//    the right pluralization in without the renderer caring.
//
// 5. The orchestrator caps to MAX_VISIBLE insights and re-emits the most
//    important ones first. We never show more than ~5 cards at once.

import type { BudgetAllocation, BudgetBucket, Category, Wedding } from '../types';
import { aggregateSpendByBucket, resolveBucket, computeBudgetScore } from '../constants/defaultCategories';

// ── Types ────────────────────────────────────────────────────────────────

export type InsightSeverity = 'good' | 'info' | 'warn' | 'bad';

export interface Insight {
  /** Stable rule ID + period-scoped suffix when applicable. Dismissals key on this. */
  id: string;
  severity: InsightSeverity;
  /** 1 (low) … 5 (must-see). The orchestrator sorts by this. */
  priority: number;
  icon: string;
  title: string;
  body: string;
  /** Optional CTA — usually a deep-link into the filtered expense list. */
  actionLabel?: string;
  actionHref?: string;
}

/** Translation function shape — duck-typed against LanguageContext.t. */
export type TFn = (key: string, vars?: Record<string, string | number>) => string;

/** Currency formatter — duck-typed against the page's local `fmt` helper. */
export type FmtFn = (n: number) => string;

/** Shape of the /analytics response sections this engine consumes. */
export interface AnalyticsInput {
  totalSpent: number;
  totalCount: number;
  spanDays: number;
  avgPerDay: number;
  totalBudget?: number;
  biggestExpense: {
    _id?: string;
    amount: number;
    category?: string;
    description?: string;
    vendor?: string;
    createdAt?: string;
  } | null;
  categoryBreakdown: Array<{ _id: string; total: number; count: number }>;
  vendorBreakdown: Array<{ _id: string; total: number; count: number }>;
  /** L2 — previous-period comparison block. null when caller didn't request it. */
  prev: {
    totalSpent: number;
    totalCount: number;
    categoryBreakdown: Array<{ _id: string; total: number; count: number }>;
    from?: string;
    to?: string;
  } | null;
  /** L2 — backend-supplied stable-amount vendor candidates (already filtered). */
  recurringCandidates: Array<{
    vendor: string;
    avgMonthlyAmount: number;
    monthsSeen: number;
    stability: number;
  }>;
}

/** Context the rule engine needs beyond the analytics response. */
export interface RuleContext {
  wedding: Wedding | null | undefined;
  /** Same allocation the BudgetScoreCard uses. Defaults to 50/30/20 upstream. */
  allocation: BudgetAllocation;
  t: TFn;
  fmt: FmtFn;
}

// ── Constants (all noise floors and thresholds in ONE place) ────────────

/** Smallest absolute change that's worth surfacing. Anything below = noise. */
const ABS_NOISE_FLOOR = 500;
/** Bucket deviation that triggers an insight (percentage points from target). */
const BUCKET_DEVIATION_THRESHOLD_PP = 10;
/** Bucket deviation that escalates from warn → bad. */
const BUCKET_DEVIATION_BAD_PP = 20;
/** % change that triggers MoM category insight (must also clear ABS_NOISE_FLOOR). */
const MOM_PCT_THRESHOLD = 15;
/** Multiplier on avg/day that flags a single expense as "much larger than typical". */
const LARGE_EXPENSE_DAYS_MULTIPLIER = 7;
/** Velocity: current pace vs previous as % to flag as "spending fast". */
const VELOCITY_FAST_PCT = 120;
/** Maximum number of insight cards we ever render. */
export const MAX_VISIBLE_INSIGHTS = 5;

const SEVERITY_ORDER: Record<InsightSeverity, number> = { bad: 4, warn: 3, info: 2, good: 1 };

// ── Helpers ──────────────────────────────────────────────────────────────

function safePct(a: number, b: number): number {
  if (b === 0) return a === 0 ? 0 : 100;
  return ((a - b) / Math.abs(b)) * 100;
}

function bucketByName(categories: Category[] | undefined | null): Map<string, BudgetBucket> {
  const m = new Map<string, BudgetBucket>();
  for (const c of categories || []) m.set(c.name.toLowerCase(), resolveBucket(c));
  return m;
}

function categoryIcon(categories: Category[] | undefined | null, name: string): string {
  return categories?.find((c) => c.name === name)?.icon || '📦';
}

// ── Rule definitions ────────────────────────────────────────────────────

type Rule = (input: AnalyticsInput, ctx: RuleContext) => Insight | null;

/**
 * RULE 1 — Budget bucket deviation. Looks at the single biggest |delta|
 * across Need / Want / Saving vs the user's target. Emits a warn or bad
 * card when the deviation crosses the threshold; emits a positive "good"
 * card when the user is hitting their target nearly exactly.
 */
const ruleBucketDeviation: Rule = (input, { wedding, allocation, t, fmt }) => {
  // Need at least some spend to bucket-classify.
  if (input.totalSpent <= 0) return null;
  const spendMap: Record<string, number> = {};
  for (const c of input.categoryBreakdown) spendMap[c._id] = c.total;
  const buckets = aggregateSpendByBucket(wedding?.categories || [], spendMap);
  const score = computeBudgetScore(buckets, allocation);
  if (score.isEmpty) return null;

  // Find the single biggest |delta| bucket — one signal, not three.
  const ordered = (['need', 'want', 'saving'] as const)
    .map((b) => ({ bucket: b, delta: score.deltaPct[b] }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = ordered[0];

  // Tiny deviation → "on target" positive card. We want to give the user a
  // win when they earn one; finance UX is too often only-negatives.
  if (Math.abs(top.delta) < 3) {
    return {
      id: 'bucket-on-target',
      severity: 'good',
      priority: 2,
      icon: '✅',
      title: t('insights.rule.bucket.onTarget.title'),
      body: t('insights.rule.bucket.onTarget.body', { score: score.score }),
    };
  }

  if (Math.abs(top.delta) < BUCKET_DEVIATION_THRESHOLD_PP) return null;

  const isOver = top.delta > 0;
  const severity: InsightSeverity =
    Math.abs(top.delta) >= BUCKET_DEVIATION_BAD_PP ? 'bad' : 'warn';
  const dir = isOver ? 'over' : 'under';

  // For "over Want" specifically — surface the top Want category as the
  // likely culprit so the insight is actionable not just observational.
  let topContributor: string | undefined;
  if (top.bucket === 'want' && isOver) {
    const wbMap = bucketByName(wedding?.categories);
    const wantCats = input.categoryBreakdown.filter((c) => wbMap.get(c._id.toLowerCase()) === 'want');
    topContributor = wantCats[0]?._id;
  }

  return {
    id: `bucket-${top.bucket}-${dir}`,
    severity,
    priority: severity === 'bad' ? 5 : 4,
    icon: isOver ? '⚠️' : '👍',
    title: t(`insights.rule.bucket.${top.bucket}.${dir}.title`, { pct: Math.abs(top.delta) }),
    body: topContributor
      ? t(`insights.rule.bucket.${top.bucket}.${dir}.bodyContrib`, {
          pct: Math.abs(top.delta),
          category: topContributor,
          score: score.score,
        })
      : t(`insights.rule.bucket.${top.bucket}.${dir}.body`, {
          pct: Math.abs(top.delta),
          score: score.score,
        }),
    actionLabel: topContributor ? t('insights.rule.action.viewCategory') : undefined,
    actionHref: topContributor
      ? `/my-expenses?category=${encodeURIComponent(topContributor)}`
      : undefined,
  };
};

/**
 * RULE 2 — Month-over-month delta on the current period's TOP category.
 * Catches "your dining out is way up vs last month" — the canonical
 * actionable observation. Requires prev data; silently skips on cold start.
 */
const ruleMoMTopCategory: Rule = (input, { wedding, t, fmt }) => {
  if (!input.prev) return null;
  const top = input.categoryBreakdown[0];
  if (!top) return null;
  const prevSame = input.prev.categoryBreakdown.find((c) => c._id === top._id);
  const prevAmount = prevSame?.total || 0;
  const absDelta = top.total - prevAmount;
  if (Math.abs(absDelta) < ABS_NOISE_FLOOR) return null;
  // % uses prev as denominator unless prev is zero (then current is "new").
  const pct = prevAmount === 0 ? null : safePct(top.total, prevAmount);
  if (pct !== null && Math.abs(pct) < MOM_PCT_THRESHOLD) return null;

  const isUp = absDelta > 0;
  const severity: InsightSeverity = isUp ? 'warn' : 'good';
  const icon = categoryIcon(wedding?.categories, top._id);

  return {
    id: `mom-cat-${top._id}-${isUp ? 'up' : 'down'}`,
    severity,
    priority: 3,
    icon,
    title: t(isUp ? 'insights.rule.mom.up.title' : 'insights.rule.mom.down.title', {
      category: top._id,
    }),
    body: pct !== null
      ? t(isUp ? 'insights.rule.mom.up.body' : 'insights.rule.mom.down.body', {
          category: top._id,
          amount: fmt(Math.abs(absDelta)),
          pct: Math.abs(Math.round(pct)),
        })
      : t('insights.rule.mom.new.body', { category: top._id, amount: fmt(top.total) }),
    actionLabel: t('insights.rule.action.viewCategory'),
    actionHref: `/my-expenses?category=${encodeURIComponent(top._id)}`,
  };
};

/**
 * RULE 3 — Recurring expense candidates. Surfaces ONE combined card with
 * the top 3 vendors by stability so we don't spam with a card per vendor.
 * Tappable to view the vendor's expenses (deep-link to a vendor-filtered
 * MyExpenses is a future v2 — for now no action).
 */
const ruleRecurring: Rule = (input, { t, fmt }) => {
  const candidates = (input.recurringCandidates || []).slice(0, 3);
  if (candidates.length === 0) return null;
  const totalMonthly = candidates.reduce((s, c) => s + c.avgMonthlyAmount, 0);
  const lead = candidates[0];
  return {
    id: 'recurring-detect',
    severity: 'info',
    priority: 3,
    icon: '🔁',
    title: candidates.length === 1
      ? t('insights.rule.recurring.title.one', { vendor: lead.vendor })
      : t('insights.rule.recurring.title.many', { count: candidates.length }),
    body: candidates.length === 1
      ? t('insights.rule.recurring.body.one', { vendor: lead.vendor, amount: fmt(lead.avgMonthlyAmount) })
      : t('insights.rule.recurring.body.many', {
          vendors: candidates.map((c) => c.vendor).join(', '),
          total: fmt(totalMonthly),
        }),
  };
};

/**
 * RULE 4 — Outsized single expense. Catches a single expense that's
 * dramatically larger than typical spending (defined as more than a week's
 * worth at avg/day pace). Only emits when we actually have a biggest-
 * expense entry — guards against empty periods.
 */
const ruleLargeSingleExpense: Rule = (input, { wedding, t, fmt }) => {
  const big = input.biggestExpense;
  if (!big || !big.amount) return null;
  const benchmark = Math.max(input.avgPerDay * LARGE_EXPENSE_DAYS_MULTIPLIER, ABS_NOISE_FLOOR * 2);
  if (big.amount < benchmark) return null;
  const icon = categoryIcon(wedding?.categories, big.category || '');
  // Label is either vendor (preferred) or category (fallback). Description
  // is too long for a card title.
  const label = big.vendor || big.category || t('common.unknown');
  return {
    id: `big-single-${big._id || big.amount}`,
    severity: 'info',
    priority: 2,
    icon,
    title: t('insights.rule.big.title', { amount: fmt(big.amount) }),
    body: t('insights.rule.big.body', { amount: fmt(big.amount), label }),
    actionLabel: big.category ? t('insights.rule.action.viewCategory') : undefined,
    actionHref: big.category ? `/my-expenses?category=${encodeURIComponent(big.category)}` : undefined,
  };
};

/**
 * RULE 5 — Velocity: spending faster than last period.
 *
 * Compares prev-period total against current-period total normalized by
 * span. If the current daily rate is ≥120% of the prev daily rate AND the
 * absolute current spend has cleared the noise floor (otherwise a single
 * ₹600 expense in week-1 looks like 7x velocity vs ₹0 prev), emits warn.
 */
const ruleVelocity: Rule = (input, { t }) => {
  if (!input.prev) return null;
  if (input.totalSpent < ABS_NOISE_FLOOR) return null;
  const currRate = input.spanDays > 0 ? input.totalSpent / input.spanDays : 0;
  // Best-effort prev rate: use the same spanDays as a denominator since
  // resolveRange chose equivalent calendar lengths for the two windows.
  const prevRate = input.spanDays > 0 ? input.prev.totalSpent / input.spanDays : 0;
  if (prevRate <= 0) return null;
  const ratioPct = (currRate / prevRate) * 100;
  if (ratioPct < VELOCITY_FAST_PCT) return null;
  return {
    id: 'velocity-fast',
    severity: 'warn',
    priority: 3,
    icon: '🚀',
    title: t('insights.rule.velocity.title', { pct: Math.round(ratioPct - 100) }),
    body: t('insights.rule.velocity.body', { pct: Math.round(ratioPct - 100) }),
  };
};

// ── Orchestrator ─────────────────────────────────────────────────────────

const ALL_RULES: Rule[] = [
  ruleBucketDeviation,
  ruleMoMTopCategory,
  ruleRecurring,
  ruleLargeSingleExpense,
  ruleVelocity,
];

/**
 * Run every rule, drop nulls, drop dismissed IDs, sort by (priority desc,
 * severity desc), cap at MAX_VISIBLE_INSIGHTS.
 *
 * The dismissedIds parameter is a Set so the caller can pass a memoized
 * snapshot derived from localStorage without re-allocating every render.
 */
export function computeInsights(
  input: AnalyticsInput,
  ctx: RuleContext,
  dismissedIds: ReadonlySet<string>,
): Insight[] {
  const out: Insight[] = [];
  for (const rule of ALL_RULES) {
    try {
      const insight = rule(input, ctx);
      if (!insight) continue;
      if (dismissedIds.has(insight.id)) continue;
      out.push(insight);
    } catch (err) {
      // One bad rule shouldn't crash the whole insights card. Surface in
      // the console for dev visibility and continue.
      if (typeof console !== 'undefined') console.warn('[insights] rule threw:', err);
    }
  }
  out.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
  });
  return out.slice(0, MAX_VISIBLE_INSIGHTS);
}

// ── Dismissal persistence ────────────────────────────────────────────────

const STORAGE_KEY = 'insights_dismissed_v1';

/** Read the dismissed-IDs set from localStorage. Defensive — never throws. */
export function loadDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((s) => typeof s === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

/** Persist the dismissed-IDs set. Silently no-ops on quota/private-mode failures. */
export function saveDismissed(ids: ReadonlySet<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // private-mode browsers throw on setItem; we silently lose the dismissal
    // for the session, which is the right failure mode (user sees the card
    // again next time they visit — acceptable degradation).
  }
}
