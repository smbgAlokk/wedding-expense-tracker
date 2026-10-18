import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '@/context/WeddingContext';
import { useLang } from '@/context/LanguageContext';
import { fmtAmount, fmtDate } from '@/utils/format';
import { getAnalytics } from '@/api';
import { cacheGet, cachedFetch } from '@/utils/dataCache';
import {
  resolveBucket,
  aggregateSpendByBucket,
  computeBudgetScore,
} from '@/constants/defaultCategories';
import { DEFAULT_BUDGET_ALLOCATION } from '@/types';
import type { BudgetBucket } from '@/types';
import LanguageToggle from '@/components/LanguageToggle';
import ThemeToggle from '@/components/ThemeToggle';
import TimeRangePicker, { resolveRange } from './TimeRangePicker';
import type { RangePreset } from './TimeRangePicker';
import Loader from '@/components/Loader';
import InsightCards from './InsightCards';
import CoachSection from '@/features/coach/CoachSection';
import RollText from '@/components/RollText';

/**
 * L1 — Insights page (Personal vertical only).
 *
 * One page that answers "where does my money go?" across configurable time
 * ranges. Sections from top to bottom:
 *
 *   1. Time range picker (chips: this month → YTD)
 *   2. KPI row (Total · Avg/day · Biggest expense · Biggest category)
 *   3. Bucket breakdown (actual N/W/S split vs target, with Budget Score)
 *   4. Category breakdown (bar list, bucket-colored, tappable → drill-through)
 *   5. Spend trend (bar chart — daily for ≤92d, monthly otherwise)
 *   6. Top vendors (top 10 by spend in the range)
 *   7. Day-of-week heatmap (7-bar histogram of when spending happens)
 *
 * GATE: Routes guard at App.tsx is auth-only; the page itself self-gates on
 * `features.monthlyBudget`. A Wedding/Trip user landing here via deep-link
 * gets bounced back to /dashboard with a toast (not 404 — gentler UX).
 *
 * DATA: One round-trip per range change via getAnalytics(). AbortController
 * cancels a stale fetch when the user rapid-clicks range chips. Caching is
 * not added in v1 — Insights opens fresh per visit; same pattern as the
 * existing Dashboard summary fetch.
 */
export default function Insights() {
  const navigate = useNavigate();
  const { wedding, features } = useWedding();
  const { t, tCat, lang } = useLang();

  // Self-gate: bounce Wedding/Trip users back to their dashboard. The router
  // would otherwise happily render this page for them but everything inside
  // is monthly-budget-flavoured, so a graceful redirect beats a broken view.
  useEffect(() => {
    if (wedding && !features.monthlyBudget) {
      toast(t('insights.gateRedirect'), { icon: 'ℹ️' });
      navigate('/dashboard', { replace: true });
    }
  }, [wedding, features.monthlyBudget, navigate, t]);

  const [preset, setPreset] = useState<RangePreset>('thisMonth');
  const range = useMemo(() => resolveRange(preset), [preset]);

  // Cache-key for this range. The TTL cache + in-flight dedupe in
  // utils/dataCache makes tab switches feel instant: returning to
  // /insights after visiting /settings within ~5 minutes serves the prior
  // payload synchronously, with zero network. Cache invalidates on every
  // expense add/edit/delete (see AddExpense.tsx + the delete handlers).
  const cacheKey = `analytics:${range.from}|${range.to}`;

  // Lazy useState init reads the cache exactly once on first render — no
  // wasted re-reads on subsequent renders, and a populated cache means
  // the page renders WITH DATA immediately instead of flashing a loader.
  const [data, setData] = useState<any>(() => cacheGet<any>(cacheKey));
  const [loading, setLoading] = useState<boolean>(() => cacheGet<any>(cacheKey) === null);
  const [error, setError] = useState<string | null>(null);

  // Per-effect-run "should I still apply the result?" gate. The controller
  // is NOT propagated into the underlying HTTP request — see dataCache.ts
  // for why (a shared deduped promise can't tolerate per-caller cancels).
  // It is only used here to drop the result if the user has moved on
  // (range chip clicked again, or component unmounted).
  const callerCtrlRef = useRef<AbortController | null>(null);
  useEffect(() => {
    // Cache hit — sync render path; zero network, no loader flash.
    const cached = cacheGet<any>(cacheKey);
    if (cached !== null) {
      setData(cached);
      setLoading(false);
      setError(null);
      return;
    }

    // Cache miss — set up the caller-side controller and kick the fetch.
    callerCtrlRef.current?.abort();
    const ctrl = new AbortController();
    callerCtrlRef.current = ctrl;

    setLoading(true);
    setError(null);

    // cachedFetch handles: (1) cache check, (2) in-flight dedupe via
    // fetchOnce, (3) cache write on success. The fetcher returns the
    // already-unwrapped analytics payload so the cache stores the data
    // shape the UI consumes — no AxiosResponse instances stored.
    //
    // CRITICAL: do NOT pass ctrl.signal to getAnalytics. The fetcher's
    // promise is shared across all StrictMode passes (and any future
    // co-callers); cancelling it on one caller's cleanup would make
    // every other caller receive a rejected promise. See dataCache.ts
    // docstring for the full contract.
    cachedFetch(cacheKey, async () => {
      const res = await getAnalytics({
        from: range.from,
        to: range.to,
        // L2 — always request prev-period comparison data. Server returns
        // `prev: null` if the bounds are malformed; rule engine handles
        // both null prev (first-time user) and zero-spend prev (fresh user)
        // gracefully.
        prevFrom: range.prevFrom,
        prevTo: range.prevTo,
      });
      return res.data?.data ?? null;
    })
      .then((payload) => {
        if (ctrl.signal.aborted) return;
        setData(payload);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setError(err?.response?.data?.message || t('insights.errLoad'));
        setData(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => { ctrl.abort(); };
  }, [cacheKey, range.from, range.to, range.prevFrom, range.prevTo, t]);

  const currency = data?.currency || wedding?.currency || '₹';
  const fmt = (n: number) => fmtAmount(n, currency, t);

  // ── Derived metrics ────────────────────────────────────────────────────
  const totalSpent: number = data?.totalSpent ?? 0;
  const totalCount: number = data?.totalCount ?? 0;
  const avgPerDay: number = data?.avgPerDay ?? 0;
  const biggestExpense = data?.biggestExpense ?? null;
  const categoryBreakdown: Array<{ _id: string; total: number; count: number }> =
    data?.categoryBreakdown ?? [];
  const vendorBreakdown: Array<{ _id: string; total: number; count: number }> =
    data?.vendorBreakdown ?? [];
  const dayOfWeekBreakdown: Array<{ day: number; total: number; count: number }> =
    data?.dayOfWeekBreakdown ?? [];
  const trend: Array<{ _id: string; total: number; count: number }> = data?.trend ?? [];
  const granularity: 'day' | 'month' = data?.granularity ?? 'day';

  const biggestCategory = categoryBreakdown[0];

  // L0 bucket math — reuse helpers already shipped for the Dashboard.
  const allocation = wedding?.budgetAllocation ?? DEFAULT_BUDGET_ALLOCATION;
  const spendByBucket = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of categoryBreakdown) map[c._id] = c.total;
    return aggregateSpendByBucket(wedding?.categories ?? [], map);
  }, [categoryBreakdown, wedding?.categories]);
  const score = useMemo(
    () => computeBudgetScore(spendByBucket, allocation),
    [spendByBucket, allocation]
  );

  const hasData = totalCount > 0;

  // Loading state — page chrome stays, the shared Loader fills the content area.
  if (loading && !data) {
    return (
      <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
        <InsightsHeader />
        <TimeRangePicker value={preset} onChange={setPreset} />
        <Loader label={t('common.loading')} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
        <InsightsHeader />
        <TimeRangePicker value={preset} onChange={setPreset} />
        <div className="surface-card empty-state" style={{ padding: 'var(--space-10) var(--space-5)' }}>
          <div className="emoji">⚠️</div>
          <h3>{t('insights.errLoad')}</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      <InsightsHeader />
      <TimeRangePicker value={preset} onChange={setPreset} />

      {!hasData ? (
        <div className="surface-card empty-state" style={{ padding: 'var(--space-12) var(--space-5)', marginTop: 16 }}>
          <div className="emoji">📊</div>
          <h3>{t('insights.empty.title')}</h3>
          <p>{t('insights.empty.body')}</p>
        </div>
      ) : (
        <>
          {/* L2 — Smart Insight cards. Self-gates internally: returns null
              when no rules fire (cold-start) and renders a minimal "show
              dismissed" affordance when the user has buried every card. */}
          <InsightCards analytics={data} />

          {/* L3 — AI Coach. Self-gates on status fetch: shows a CTA to
              Settings when not enabled, a waitlist CTA when quota is
              exceeded, and the chat surface when ready. Analytics payload
              is passed so the coach has the same data the user is viewing. */}
          <CoachSection analytics={data} />

          {/* KPI row — Total · Avg/day · Biggest expense · Biggest category */}
          <section className="insight-grid stagger" style={{ marginTop: 16, marginBottom: 24 }}>
            <div className="insight-tile">
              <div className="insight-icon" aria-hidden="true">💰</div>
              <div className="insight-value text-tnum">{fmt(totalSpent)}</div>
              <div className="insight-label">{t('insights.kpi.total')}</div>
            </div>
            <div className="insight-tile">
              <div className="insight-icon" aria-hidden="true">📊</div>
              <div className="insight-value text-tnum">{fmt(avgPerDay)}</div>
              <div className="insight-label">{t('insights.kpi.avgPerDay')}</div>
            </div>
            {biggestExpense && (
              <div className="insight-tile">
                <div className="insight-icon" aria-hidden="true">💎</div>
                <div className="insight-value text-tnum">{fmt(biggestExpense.amount)}</div>
                <div className="insight-label">{t('insights.kpi.biggestExpense')}</div>
              </div>
            )}
            {biggestCategory && (
              <button
                type="button"
                className="insight-tile insight-tile-clickable"
                onClick={() => navigate(`/my-expenses?category=${encodeURIComponent(biggestCategory._id)}`)}
              >
                <div className="insight-icon" aria-hidden="true">
                  {wedding?.categories?.find(c => c.name === biggestCategory._id)?.icon || '📂'}
                </div>
                <div className="insight-value insight-value-sm">{tCat(biggestCategory._id)}</div>
                <div className="insight-label text-tnum">{fmt(biggestCategory.total)}</div>
              </button>
            )}
          </section>

          {/* Bucket breakdown — actual N/W/S split vs target. Drives the
              "where is money going unnecessarily" intuition explicitly. */}
          {!score.isEmpty && (
            <BucketBreakdownCard
              spendByBucket={spendByBucket}
              actualPct={score.actualPct}
              targetPct={allocation}
              score={score.score}
              fmt={fmt}
            />
          )}

          {/* Category breakdown — bar list colored by N/W/S bucket. Tap to
              drill into the filtered MyExpenses list for that category. */}
          <CategoryBreakdownSection
            categoryBreakdown={categoryBreakdown}
            wedding={wedding}
            totalSpent={totalSpent}
            tCat={tCat}
            fmt={fmt}
            onCategoryClick={(name) => navigate(`/my-expenses?category=${encodeURIComponent(name)}`)}
          />

          {/* Spend trend chart — daily bars for short ranges, monthly for
              long ones. Server picks granularity unless overridden. */}
          {trend.length > 0 && (
            <TrendChart trend={trend} granularity={granularity} lang={lang} fmt={fmt} />
          )}

          {/* Top vendors — only renders if user has used the vendor field
              on at least one expense. */}
          {vendorBreakdown.length > 0 && (
            <VendorLeaderboard vendors={vendorBreakdown} fmt={fmt} />
          )}

          {/* Day-of-week histogram — shows WHEN spending happens. */}
          {dayOfWeekBreakdown.length > 0 && (
            <DayOfWeekHeatmap dayOfWeek={dayOfWeekBreakdown} lang={lang} fmt={fmt} />
          )}
        </>
      )}
    </div>
  );
}

// ── Header component (tiny — extracted only because it's reused in
//    loading / error / empty states above) ────────────────────────────────
function InsightsHeader() {
  const { t } = useLang();
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <h1 className="h1" style={{ fontSize: '1.55rem', wordBreak: 'break-word' }}>
        {t('insights.header')}
      </h1>
      <div className="hide-desktop" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}

// ── Bucket breakdown card ───────────────────────────────────────────────
interface BucketBreakdownCardProps {
  spendByBucket: Record<BudgetBucket, number>;
  actualPct: Record<BudgetBucket, number>;
  targetPct: { need: number; want: number; saving: number };
  score: number;
  fmt: (n: number) => string;
}
function BucketBreakdownCard({ spendByBucket, actualPct, targetPct, score, fmt }: BucketBreakdownCardProps) {
  const { t } = useLang();
  const total = spendByBucket.need + spendByBucket.want + spendByBucket.saving;

  // Stacked bar segment widths driven by actual percentages, falling back to
  // a single grey track if the total is zero (defensive — caller already
  // gates on hasData but the bucket card is showable independently).
  const seg = (n: number) => total > 0 ? `${(n / total) * 100}%` : '0%';

  const tone = score >= 80 ? 'good' : score >= 50 ? 'warn' : 'bad';

  return (
    <section className={`bucket-breakdown-card bucket-breakdown-${tone}`} style={{ marginBottom: 24 }}>
      <div className="bucket-breakdown-head">
        <h3 className="section-title" style={{ marginBottom: 0 }}>{t('insights.bucket.title')}</h3>
        <span className="bucket-breakdown-score text-tnum" aria-label={t('insights.bucket.scoreAria', { score })}>
          {t('insights.bucket.score', { score })}
        </span>
      </div>
      <div className="bucket-stack" role="img" aria-label={t('insights.bucket.stackAria')}>
        <div className="bucket-stack-seg bucket-stack-need"   style={{ width: seg(spendByBucket.need) }} />
        <div className="bucket-stack-seg bucket-stack-want"   style={{ width: seg(spendByBucket.want) }} />
        <div className="bucket-stack-seg bucket-stack-saving" style={{ width: seg(spendByBucket.saving) }} />
      </div>
      <div className="bucket-rows">
        {(['need', 'want', 'saving'] as const).map((b) => {
          const amount = spendByBucket[b];
          const delta = actualPct[b] - targetPct[b];
          return (
            <div key={b} className={`bucket-row bucket-row-${b}`}>
              <span className="bucket-row-label">{t(`settings.alloc.${b}`)}</span>
              <span className="bucket-row-amount text-tnum">{fmt(amount)}</span>
              <span className="bucket-row-pct text-tnum">{actualPct[b]}%</span>
              <span className="bucket-row-target text-tnum">
                {t('insights.bucket.targetShort', { pct: targetPct[b] })}
              </span>
              <span
                className={`bucket-row-delta ${delta > 0 ? 'is-over' : delta < 0 ? 'is-under' : 'is-on'}`}
                aria-label={delta > 0
                  ? t('dashboard.score.deltaOver', { pct: delta })
                  : delta < 0
                    ? t('dashboard.score.deltaUnder', { pct: Math.abs(delta) })
                    : t('dashboard.score.deltaOn')}
              >
                {delta === 0 ? '—' : delta > 0 ? `+${delta}` : `${delta}`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Category breakdown ─────────────────────────────────────────────────
interface CategoryBreakdownSectionProps {
  categoryBreakdown: Array<{ _id: string; total: number; count: number }>;
  wedding: any;
  totalSpent: number;
  tCat: (n: string) => string;
  fmt: (n: number) => string;
  onCategoryClick: (name: string) => void;
}
function CategoryBreakdownSection({
  categoryBreakdown,
  wedding,
  totalSpent,
  tCat,
  fmt,
  onCategoryClick,
}: CategoryBreakdownSectionProps) {
  const { t } = useLang();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? categoryBreakdown : categoryBreakdown.slice(0, 8);

  return (
    <section style={{ marginBottom: 24 }}>
      <h3 className="section-title">{t('insights.category.title')}</h3>
      <div className="surface-card insights-cat-list" style={{ padding: 'var(--space-2) var(--space-4)' }}>
        {visible.map((cat, idx) => {
          const wcat = wedding?.categories?.find((c: any) => c.name === cat._id);
          const icon = wcat?.icon || '📦';
          const bucket = resolveBucket(wcat);
          const pct = totalSpent > 0 ? Math.round((cat.total / totalSpent) * 100) : 0;
          return (
            <button
              key={cat._id}
              type="button"
              className={`insights-cat-row insights-cat-row-${bucket}`}
              onClick={() => onCategoryClick(cat._id)}
              style={{ borderBottom: idx < visible.length - 1 ? '1px solid var(--divider)' : 'none' }}
            >
              <span className="insights-cat-icon">{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <span className="insights-cat-name">{tCat(cat._id)}</span>
                  <span className="text-tnum insights-cat-amount">{fmt(cat.total)}</span>
                </div>
                <div className="insights-cat-bar-bg">
                  <div className={`insights-cat-bar-fill bucket-fill-${bucket}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="insights-cat-meta">
                  <span>
                    {cat.count === 1
                      ? t('dashboard.catMetaOne')
                      : t('dashboard.catMeta', { count: cat.count })}
                  </span>
                  <span className="text-tnum">{pct}%</span>
                </div>
              </div>
              <span className={`insights-cat-bucket-badge bucket-badge-${bucket}`}>
                {t(`settings.bucket.short.${bucket}`)}
              </span>
            </button>
          );
        })}
        {categoryBreakdown.length > 8 && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => setShowAll((s) => !s)}
            style={{ width: '100%', marginTop: 4, borderTop: '1px solid var(--divider)', paddingTop: 10, borderRadius: 0 }}
          >
            <RollText>{showAll
              ? t('dashboard.showLess')
              : t('dashboard.showMoreCats', { count: categoryBreakdown.length - 8 })}</RollText>
          </button>
        )}
      </div>
    </section>
  );
}

// ── Trend chart (daily or monthly bars) ──────────────────────────────────
interface TrendChartProps {
  trend: Array<{ _id: string; total: number; count: number }>;
  granularity: 'day' | 'month';
  lang: string;
  fmt: (n: number) => string;
}
function TrendChart({ trend, granularity, lang, fmt }: TrendChartProps) {
  const { t } = useLang();
  const max = trend.reduce((m, b) => Math.max(m, b.total), 0);

  // Format the bucket label. For 'day' the _id is YYYY-MM-DD; for 'month' it
  // is YYYY-MM. Parse-and-localize so Hindi mode shows Devanagari month names.
  const labelFor = (id: string): string => {
    try {
      if (granularity === 'month') {
        const [y, m] = id.split('-').map(Number);
        return fmtDate(new Date(y, m - 1, 1), lang, { month: 'short', year: '2-digit' });
      }
      const [y, m, d] = id.split('-').map(Number);
      return fmtDate(new Date(y, m - 1, d), lang, { day: 'numeric', month: 'short' });
    } catch {
      return id;
    }
  };

  // Show at most 5 evenly-spaced X-axis labels for readability — the same
  // approach as the existing Dashboard density chart.
  const tickIdxs = useMemo(() => {
    if (trend.length <= 5) return trend.map((_, i) => i);
    const want = 5;
    const step = Math.max(1, Math.floor((trend.length - 1) / (want - 1)));
    const idxs: number[] = [];
    for (let i = 0; i < trend.length; i += step) idxs.push(i);
    if (idxs[idxs.length - 1] !== trend.length - 1) idxs.push(trend.length - 1);
    return idxs;
  }, [trend.length]);

  return (
    <section style={{ marginBottom: 24 }}>
      <h3 className="section-title">
        {granularity === 'month' ? t('insights.trend.titleMonthly') : t('insights.trend.titleDaily')}
      </h3>
      <div className="surface-card insights-trend" role="img" aria-label={t('insights.trend.label')}>
        <div className="insights-trend-bars">
          {trend.map((b, i) => {
            const pct = max > 0 ? Math.max(4, Math.round((b.total / max) * 100)) : 4;
            const isMax = max > 0 && b.total === max;
            return (
              <div
                key={b._id}
                className={`insights-trend-bar ${isMax ? 'is-peak' : ''}`}
                title={`${labelFor(b._id)} — ${fmt(b.total)}`}
                style={{ height: `${pct}%`, animationDelay: `${Math.min(i * 18, 540)}ms` }}
              >
                {tickIdxs.includes(i) && (
                  <span className="insights-trend-tick text-tnum" aria-hidden="true">
                    {labelFor(b._id)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Vendor leaderboard ──────────────────────────────────────────────────
interface VendorLeaderboardProps {
  vendors: Array<{ _id: string; total: number; count: number }>;
  fmt: (n: number) => string;
}
function VendorLeaderboard({ vendors, fmt }: VendorLeaderboardProps) {
  const { t } = useLang();
  const max = vendors.reduce((m, v) => Math.max(m, v.total), 0);
  return (
    <section style={{ marginBottom: 24 }}>
      <h3 className="section-title">{t('insights.vendor.title')}</h3>
      <div className="surface-card insights-vendor-list" style={{ padding: 'var(--space-2) var(--space-4)' }}>
        {vendors.map((v, idx) => {
          const pct = max > 0 ? Math.max(4, Math.round((v.total / max) * 100)) : 4;
          return (
            <div
              key={v._id}
              className="insights-vendor-row"
              style={{ borderBottom: idx < vendors.length - 1 ? '1px solid var(--divider)' : 'none' }}
            >
              <span className="insights-vendor-rank text-tnum">#{idx + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <span className="insights-vendor-name">{v._id}</span>
                  <span className="text-tnum insights-vendor-amount">{fmt(v.total)}</span>
                </div>
                <div className="insights-vendor-bar-bg">
                  <div className="insights-vendor-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="insights-vendor-meta">
                  <span>
                    {v.count === 1
                      ? t('insights.vendor.visitOne')
                      : t('insights.vendor.visits', { count: v.count })}
                  </span>
                  <span className="text-tnum">{fmt(Math.round(v.total / Math.max(1, v.count)))}/visit</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Day of week heatmap ─────────────────────────────────────────────────
interface DayOfWeekHeatmapProps {
  dayOfWeek: Array<{ day: number; total: number; count: number }>;
  lang: string;
  fmt: (n: number) => string;
}
function DayOfWeekHeatmap({ dayOfWeek, lang, fmt }: DayOfWeekHeatmapProps) {
  const { t } = useLang();

  // 7-slot array, filled with zeros for days that had no spend. The backend
  // omits empty days from the response (cheaper aggregation) — we densify
  // here so the heatmap always shows all 7 bars.
  const dense = useMemo(() => {
    const arr = Array.from({ length: 7 }, (_, i) => ({ day: i, total: 0, count: 0 }));
    for (const d of dayOfWeek) {
      if (d.day >= 0 && d.day <= 6) arr[d.day] = d;
    }
    return arr;
  }, [dayOfWeek]);

  const max = dense.reduce((m, d) => Math.max(m, d.total), 0);
  const today = new Date().getDay();

  // Localized day-of-week short labels via Intl. Falls back to Mon/Tue/etc.
  // if the locale machinery hiccups.
  const dayLabel = (idx: number): string => {
    try {
      const ref = new Date(2026, 0, 4 + idx); // 2026-01-04 was a Sunday
      return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short' }).format(ref);
    } catch {
      return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][idx];
    }
  };

  return (
    <section style={{ marginBottom: 28 }}>
      <h3 className="section-title">{t('insights.dow.title')}</h3>
      <div className="surface-card insights-dow" role="img" aria-label={t('insights.dow.label')}>
        <div className="insights-dow-bars">
          {dense.map((d) => {
            const pct = max > 0 ? Math.max(4, Math.round((d.total / max) * 100)) : 4;
            const isToday = d.day === today;
            const isPeak = max > 0 && d.total === max;
            return (
              <div key={d.day} className="insights-dow-col">
                <div
                  className={`insights-dow-bar ${isPeak ? 'is-peak' : ''} ${isToday ? 'is-today' : ''} ${d.total === 0 ? 'is-empty' : ''}`}
                  style={{ height: `${pct}%` }}
                  title={`${dayLabel(d.day)} — ${fmt(d.total)}`}
                />
                <span className="insights-dow-label">{dayLabel(d.day)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
