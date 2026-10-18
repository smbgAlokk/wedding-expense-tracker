import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '@/context/WeddingContext';
import { useLang } from '@/context/LanguageContext';
import { fmtAmount, fmtDate } from '@/utils/format';
import { getCurrentPayCycle } from './payCycle';
import { getExpenseSummary } from '@/api';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageToggle from '@/components/LanguageToggle';
import ExpenseDetailSheet from '@/features/expenses/ExpenseDetailSheet';
import BudgetScoreCard from './BudgetScoreCard';

// Format the selected calendar month label ("May 2026" / "मई 2026") for the
// Personal-vertical month switcher.
function fmtMonth(d: Date, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      year: 'numeric',
      month: 'long',
      numberingSystem: 'latn',
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

// Lightweight count-up hook — animates a numeric value from prev → next over
// `duration` ms using ease-out. Skips animation when user prefers reduced motion.
function useCountUp(value: number, duration = 700): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setDisplay(value); fromRef.current = value; return; }

    const start = performance.now();
    const from = fromRef.current;
    const delta = value - from;
    if (delta === 0) return;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + delta * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else { fromRef.current = value; rafRef.current = null; }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);

  return display;
}

const AVATAR_COLORS = ['#D84381','#7C3AED','#2563EB','#059669','#D97706','#DC2626','#9333EA','#E11D48'];
function getColor(name: string): string {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// Stable color-per-category for the category breakdown bars. Same hash trick as
// avatars so the same category always lights up the same hue across renders.
const CATEGORY_HUES = [346, 280, 24, 152, 200, 14, 264, 184, 318, 96];
function getCategoryHue(name: string): number {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return CATEGORY_HUES[Math.abs(h) % CATEGORY_HUES.length];
}

// Bucket an expense into a relative time group so the activity feed reads like
// a journal (Today / Yesterday / This Week / Earlier) instead of a flat list.
function groupKey(iso: string, now = new Date()): 'today' | 'yesterday' | 'week' | 'earlier' {
  const d = new Date(iso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expenseDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - expenseDay.getTime()) / 86_400_000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 7) return 'week';
  return 'earlier';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { wedding, member, summary, loading, features, refreshSummary, isAdmin, pendingMembers } = useWedding();
  const { t, tCat, lang } = useLang();
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [showAllCats, setShowAllCats] = useState(false);

  // Personal-vertical month switcher state. `selectedMonth` is the 1st-of-month
  // Date in the user's LOCAL timezone — converting to ISO with .toISOString()
  // then gives the right UTC boundary for the backend's $gte/$lt filter (so
  // every expense the user logged during their May falls in the May query,
  // regardless of how IST/UTC offset shifts the wall-clock boundary).
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const monthRange = useMemo(() => {
    const from = selectedMonth;
    const to = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [selectedMonth]);

  // Refetch summary whenever the relevant inputs change. For Personal, this
  // re-fires when the user picks a different month; for Wedding/Trip, it just
  // pulls the lifetime summary once and never re-fires (range is stable).
  useEffect(() => {
    if (features.monthlyBudget) {
      refreshSummary({ from: monthRange.from, to: monthRange.to });
    } else {
      refreshSummary();
    }
  }, [features.monthlyBudget, monthRange.from, monthRange.to, refreshSummary]);

  const prevMonth = () => setSelectedMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const nextMonth = () => setSelectedMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  const goToCurrentMonth = () => {
    const now = new Date();
    setSelectedMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };
  const isCurrentMonth = (() => {
    const now = new Date();
    return selectedMonth.getFullYear() === now.getFullYear() && selectedMonth.getMonth() === now.getMonth();
  })();

  const currency = summary?.currency || wedding?.currency || '₹';
  const totalSpent = summary?.totalSpent || 0;
  const totalBudget = summary?.totalBudget || 0;
  const budgetPercent = summary?.budgetUsedPercent || 0;
  const remaining = summary?.remaining || 0;
  const totalCount = summary?.totalCount || 0;
  const dailyTrend = summary?.dailyTrend || [];

  // Animated count for the hero number — only used once we know the value isn't
  // mid-skeleton (`loading && !summary`) so we don't animate from 0 every load.
  const animatedTotal = useCountUp(totalSpent);
  const fmt = (n: number) => fmtAmount(n, currency, t);

  // ── Personal-vertical month-pace metrics ───────────────────────────────
  // These power: the "Days left" insight tile, the budget-pace pill, and the
  // projected month-end estimate. Only computed when month-scoped (Personal).
  const monthMetrics = useMemo(() => {
    if (!features.monthlyBudget) return null;
    const now = new Date();
    const start = selectedMonth;
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0); // last day
    const daysInMonth = end.getDate();
    // "Day of month" — for a past/future month, the elapsed days = full month.
    let elapsedDays: number;
    if (now < start) elapsedDays = 0;
    else if (now > end) elapsedDays = daysInMonth;
    else elapsedDays = now.getDate();
    const elapsedSafe = Math.max(1, elapsedDays);
    const daysLeft = Math.max(0, daysInMonth - elapsedDays);
    const avgPerDay = totalSpent / elapsedSafe;
    const projectedMonthEnd = isCurrentMonth ? avgPerDay * daysInMonth : totalSpent;
    return { daysInMonth, elapsedDays, daysLeft, avgPerDay, projectedMonthEnd };
  }, [features.monthlyBudget, selectedMonth, totalSpent, isCurrentMonth]);

  // ── Pay-cycle runway ───────────────────────────────────────────────────
  // When the user has set a `payDay` on their personal workspace, we compute
  // the current pay cycle window and fetch a separate summary for it. This is
  // a small ADDITIVE fetch alongside the calendar-month summary — the latter
  // remains the dashboard's source of truth so bills, trend, comparisons all
  // stay calendar-aligned. The runway tile just answers "how much have I spent
  // since my last paycheck, and when's the next one?".
  const payDay = wedding?.payDay ?? null;
  const payCycle = useMemo(() => {
    if (!features.monthlyBudget || payDay == null) return null;
    // Always anchor to "now" — the runway is about the user's CURRENT cashflow
    // position, not the month they happen to be browsing in the switcher.
    return getCurrentPayCycle(payDay);
  }, [features.monthlyBudget, payDay]);

  const [cycleSpent, setCycleSpent] = useState<number | null>(null);
  const cycleFetchKey = payCycle ? `${payCycle.fromIso}|${payCycle.toIso}` : null;

  useEffect(() => {
    if (!cycleFetchKey || !payCycle) {
      setCycleSpent(null);
      return;
    }
    // Local state for cancellation — if the user clears payDay or switches
    // workspace mid-flight we don't want a stale fetch to land and stamp the UI.
    let cancelled = false;
    (async () => {
      try {
        const res = await getExpenseSummary({ from: payCycle.fromIso, to: payCycle.toIso });
        if (cancelled) return;
        setCycleSpent(res.data?.data?.totalSpent ?? 0);
      } catch {
        // Silent fail — the runway tile is a "nice to have"; never crash the
        // dashboard for it. cycleSpent stays null → tile shows "—" placeholder.
        if (!cancelled) setCycleSpent(null);
      }
    })();
    return () => { cancelled = true; };
  }, [cycleFetchKey, payCycle]);

  // ── Budget pace pill ───────────────────────────────────────────────────
  // Compares actual spend-to-date against the linear pro-rata budget for the
  // same window. Three states: ahead (on track), warn (>10% over pace), over.
  const pace: { state: 'ahead' | 'warn' | 'over' | null; pctVsPace: number } = useMemo(() => {
    if (!totalBudget || !monthMetrics) return { state: null, pctVsPace: 0 };
    const expected = (totalBudget / monthMetrics.daysInMonth) * monthMetrics.elapsedDays;
    if (expected <= 0) return { state: 'ahead', pctVsPace: 0 };
    const ratio = (totalSpent - expected) / expected;
    if (totalSpent > totalBudget) return { state: 'over', pctVsPace: Math.round(ratio * 100) };
    if (ratio > 0.10) return { state: 'warn', pctVsPace: Math.round(ratio * 100) };
    return { state: 'ahead', pctVsPace: Math.round(ratio * 100) };
  }, [totalSpent, totalBudget, monthMetrics]);

  // ── Insight metrics — top category + largest expense ───────────────────
  const topCategory = summary?.categoryBreakdown?.[0];
  const largestExpense = useMemo(() => {
    const list = summary?.recentExpenses || [];
    if (!list.length) return null;
    return list.reduce((max, e) => (e.amount > (max?.amount || 0) ? e : max), list[0]);
  }, [summary?.recentExpenses]);

  // ── Quick-add chips — most-used categories for 1-tap entry ─────────────
  // Falls back to first 4 defined categories on first-of-month / empty state.
  const quickAddCats = useMemo(() => {
    const breakdown = summary?.categoryBreakdown || [];
    const top = breakdown.slice(0, 4).map(c => c._id);
    if (top.length >= 4) return top;
    const fallback = (wedding?.categories || []).map(c => c.name).filter(n => !top.includes(n));
    return [...top, ...fallback].slice(0, 4);
  }, [summary?.categoryBreakdown, wedding?.categories]);

  // ── Daily-trend chart geometry ────────────────────────────────────────
  // Build a dense day-keyed map so missing days render as zero bars (a sparse
  // bar chart looks broken). For Personal, fill the whole selected month; for
  // Wedding/Trip, the last 30 days (matches backend trendMatch window).
  const trendBars = useMemo(() => {
    if (!features.monthlyBudget && dailyTrend.length === 0) return [];

    const byDay = new Map<string, number>();
    for (const d of dailyTrend) byDay.set(d._id, d.total);

    const days: { iso: string; date: Date; total: number }[] = [];
    if (features.monthlyBudget) {
      const start = selectedMonth;
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      for (let day = 1; day <= end.getDate(); day++) {
        const date = new Date(start.getFullYear(), start.getMonth(), day);
        const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        days.push({ iso, date, total: byDay.get(iso) || 0 });
      }
    } else {
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        days.push({ iso, date, total: byDay.get(iso) || 0 });
      }
    }
    return days;
  }, [features.monthlyBudget, selectedMonth, dailyTrend]);

  const trendMax = useMemo(() => trendBars.reduce((m, b) => Math.max(m, b.total), 0), [trendBars]);
  const trendPeak = useMemo(() => trendBars.find(b => b.total === trendMax && trendMax > 0) || null, [trendBars, trendMax]);
  // Average per *spent* day — empty days drag the avg toward zero and make the
  // reference line useless, so we exclude zero days from the denominator.
  const trendAvg = useMemo(() => {
    const spent = trendBars.filter(b => b.total > 0);
    if (!spent.length) return 0;
    return spent.reduce((s, b) => s + b.total, 0) / spent.length;
  }, [trendBars]);
  const todayIso = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

  // X-axis ticks: roughly five evenly-spaced labels across the chart so the
  // user can locate any day without each bar needing its own label.
  const trendTicks = useMemo(() => {
    if (trendBars.length === 0) return [];
    const want = 5;
    const step = Math.max(1, Math.floor((trendBars.length - 1) / (want - 1)));
    const idxs: number[] = [];
    for (let i = 0; i < trendBars.length; i += step) idxs.push(i);
    if (idxs[idxs.length - 1] !== trendBars.length - 1) idxs.push(trendBars.length - 1);
    return idxs;
  }, [trendBars]);

  // Selected day — drives the info banner above the chart. Defaults to today
  // (when it falls within the rendered window AND has spend), else the peak.
  // A user tap overrides; switching months resets via the useEffect below.
  const [selectedTrendIso, setSelectedTrendIso] = useState<string | null>(null);
  useEffect(() => {
    if (!trendBars.length) { setSelectedTrendIso(null); return; }
    const todayBar = trendBars.find(b => b.iso === todayIso && b.total > 0);
    setSelectedTrendIso(todayBar ? todayBar.iso : (trendPeak?.iso ?? null));
  }, [trendBars, trendPeak, todayIso]);
  const selectedBar = useMemo(
    () => trendBars.find(b => b.iso === selectedTrendIso) || null,
    [trendBars, selectedTrendIso]
  );

  // ── Grouped recent activity ────────────────────────────────────────────
  const groupedRecent = useMemo(() => {
    const list = summary?.recentExpenses?.slice(0, 8) || [];
    const groups: Record<'today' | 'yesterday' | 'week' | 'earlier', typeof list> = {
      today: [], yesterday: [], week: [], earlier: [],
    };
    for (const e of list) groups[groupKey(e.createdAt)].push(e);
    return groups;
  }, [summary?.recentExpenses]);

  const hasContributors = (summary?.memberBreakdown?.length ?? 0) > 0;
  const hasCategories = (summary?.categoryBreakdown?.length ?? 0) > 0;
  const hasRecent = (summary?.recentExpenses?.length ?? 0) > 0;
  const hasTrend = trendBars.length > 0 && trendMax > 0;

  // Build "tap a category to view its expenses" link for the breakdown rows.
  // Wedding/Trip routes to AllExpenses (everyone), Personal to MyExpenses.
  const categoryListPath = features.multiMember ? '/all-expenses' : '/my-expenses';

  if (loading && !summary) {
    return (
      <div className="container page-content" style={{ paddingTop: 20 }}>
        <div className="skeleton" style={{ height: 60, marginBottom: 24, width: '60%' }} />
        <div className="skeleton" style={{ height: 200, marginBottom: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div className="skeleton" style={{ height: 92 }} />
          <div className="skeleton" style={{ height: 92 }} />
        </div>
        <div className="skeleton" style={{ height: 240 }} />
      </div>
    );
  }

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>
            {t('dashboard.welcome', { name: member?.name || '' })}
          </p>
          <h1 className="h1" style={{ marginTop: 4, fontSize: '1.55rem', wordWrap: 'break-word' }}>
            {wedding?.weddingName || t('dashboard.fallbackName')}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <LanguageToggle />
          <ThemeToggle />
          <div className="avatar" style={{ background: getColor(member?.name || ''), width: 44, height: 44, fontSize: '1rem' }}>
            {(member?.name || 'U')[0].toUpperCase()}
          </div>
        </div>
      </header>

      {/* Month switcher — Personal vertical only */}
      {features.monthlyBudget && (
        <div className="surface-card month-switcher" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 'var(--space-3) var(--space-4)', marginBottom: 12 }}>
          <button
            type="button"
            onClick={prevMonth}
            aria-label={t('dashboard.prevMonth')}
            className="btn btn-ghost"
            style={{ minWidth: 44, padding: '6px 10px', fontSize: '1rem' }}
          >
            ◀
          </button>
          <button
            type="button"
            onClick={goToCurrentMonth}
            disabled={isCurrentMonth}
            className="btn btn-ghost"
            style={{ flex: 1, fontWeight: 600, fontSize: '1rem', textAlign: 'center', padding: '6px 10px' }}
            aria-label={t('dashboard.goToCurrentMonth')}
            title={isCurrentMonth ? '' : t('dashboard.goToCurrentMonth')}
          >
            {fmtMonth(selectedMonth, lang)}
            {!isCurrentMonth && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 6 }}>↻</span>}
          </button>
          <button
            type="button"
            onClick={nextMonth}
            aria-label={t('dashboard.nextMonth')}
            className="btn btn-ghost"
            style={{ minWidth: 44, padding: '6px 10px', fontSize: '1rem' }}
          >
            ▶
          </button>
        </div>
      )}

      {isAdmin && pendingMembers.length > 0 && (
        <button
          type="button"
          className="surface-card"
          onClick={() => navigate('/members')}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: 'var(--space-3) var(--space-4)', border: '1px solid var(--warning)', background: 'var(--warning-bg)', cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit' }}
        >
          <span style={{ fontSize: '1.4rem' }} aria-hidden="true">🙋</span>
          <span style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem' }}>{t('dashboard.pendingRequests', { count: pendingMembers.length })}</span>
          <span style={{ color: 'var(--warning)', fontWeight: 700 }} aria-hidden="true">→</span>
        </button>
      )}

      {/* Total Expense Hero */}
      <div className="hero-card sparkle" style={{ textAlign: 'center', marginBottom: 16, padding: 'var(--space-8) var(--space-5)' }}>
        <p className="section-title" style={{ marginBottom: 6 }}>
          {features.monthlyBudget ? t('dashboard.monthlySpent') : t('dashboard.totalExpenses')}
        </p>
        <h2 className="text-tnum" style={{ fontSize: 'clamp(2.4rem, 9vw, 3.2rem)', fontWeight: 800, color: 'var(--primary-light)', lineHeight: 1.05, letterSpacing: '-0.03em' }}>
          {fmt(Math.round(animatedTotal))}
        </h2>
        {totalBudget > 0 && (
          <div className="budget-bar-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>
              <span className="text-tnum">{t('dashboard.percentUsed', { percent: budgetPercent })}</span>
              <span className="text-tnum">
                {remaining >= 0
                  ? t('dashboard.amountLeft', { amount: fmt(remaining) })
                  : t('dashboard.amountOver', { amount: fmt(Math.abs(remaining)) })}
              </span>
            </div>
            <div className="budget-bar-bg">
              <div className={`budget-bar-fill ${budgetPercent > 100 ? 'over-budget' : ''}`} style={{ width: `${Math.min(budgetPercent, 100)}%` }} />
            </div>
          </div>
        )}

        {/* Budget pace pill — Personal only, when a budget exists */}
        {features.monthlyBudget && pace.state && (
          <div className="pace-row">
            <span className={`pace-pill pace-${pace.state}`}>
              <span className="pace-dot" />
              {pace.state === 'ahead' && t('dashboard.paceAhead')}
              {pace.state === 'warn' && t('dashboard.paceWarn', { pct: Math.abs(pace.pctVsPace) })}
              {pace.state === 'over' && t('dashboard.paceOver')}
            </span>
            {monthMetrics && isCurrentMonth && monthMetrics.projectedMonthEnd > 0 && (
              <span className="pace-projection text-tnum" title={t('dashboard.projectionTitle')}>
                {t('dashboard.projected', { amount: fmt(Math.round(monthMetrics.projectedMonthEnd)) })}
              </span>
            )}
          </div>
        )}

        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 14, fontWeight: 500 }}>
          {totalCount === 1 ? t('dashboard.expensesTrackedOne') : t('dashboard.expensesTracked', { count: totalCount })}
        </p>
      </div>

      {/* L0 — Budget Score card. Renders only for Personal verticals with
          at least one expense in the period. Self-gates internally so the
          parent doesn't need to duplicate the `features.monthlyBudget`
          check; layout is a no-op when collapsed. */}
      {hasCategories && (
        <div style={{ marginBottom: 16 }}>
          <BudgetScoreCard categoryBreakdown={summary?.categoryBreakdown || []} />
        </div>
      )}

      {/* Insight tiles — Personal-flavoured row of quick stats. For Wedding/Trip
          this collapses to the original 2-stat grid (Contributors + Categories). */}
      {features.monthlyBudget ? (
        <div className="insight-grid stagger" style={{ marginBottom: 28 }}>
          {monthMetrics && (
            <div className="insight-tile">
              <div className="insight-icon" aria-hidden="true">📊</div>
              <div className="insight-value text-tnum">{fmt(Math.round(monthMetrics.avgPerDay))}</div>
              <div className="insight-label">{t('dashboard.avgPerDay')}</div>
            </div>
          )}
          {topCategory && (
            <button
              type="button"
              className="insight-tile insight-tile-clickable"
              onClick={() => navigate(`${categoryListPath}?category=${encodeURIComponent(topCategory._id)}`)}
              aria-label={t('dashboard.openTopCategory')}
            >
              <div className="insight-icon" aria-hidden="true">
                {wedding?.categories?.find(c => c.name === topCategory._id)?.icon || '🔥'}
              </div>
              <div className="insight-value insight-value-sm">{tCat(topCategory._id)}</div>
              <div className="insight-label text-tnum">{fmt(topCategory.total)}</div>
            </button>
          )}
          {largestExpense && (
            <button
              type="button"
              className="insight-tile insight-tile-clickable"
              onClick={() => setSelectedExpense(largestExpense)}
              aria-label={t('dashboard.openLargestExpense')}
            >
              <div className="insight-icon" aria-hidden="true">💎</div>
              <div className="insight-value text-tnum">{fmt(largestExpense.amount)}</div>
              <div className="insight-label">{t('dashboard.largestExpense')}</div>
            </button>
          )}
          {/* 4th tile is dynamic: pay-cycle runway when payDay is set, else
              calendar "Days left in month". The runway only appears while the
              user is viewing the current month — historical months would make
              the cashflow tile misleading (the cycle anchors to "now"). */}
          {payCycle && isCurrentMonth ? (
            <div className="insight-tile insight-tile-runway">
              <div className="insight-icon" aria-hidden="true">💰</div>
              <div className="insight-value text-tnum">
                {payCycle.daysUntilEnd === 0
                  ? t('dashboard.runway.payToday')
                  : payCycle.daysUntilEnd === 1
                    ? t('dashboard.runway.tomorrow')
                    : payCycle.daysUntilEnd}
              </div>
              <div className="insight-label">
                {payCycle.daysUntilEnd > 1
                  ? t('dashboard.runway.daysUntil', {
                      date: fmtDate(payCycle.end, lang, { day: 'numeric', month: 'short' }),
                    })
                  : t('dashboard.runway.nextPayday')}
              </div>
              {cycleSpent != null && (
                <div className="runway-foot text-tnum" title={t('dashboard.runway.spentTitle')}>
                  {t('dashboard.runway.spentSinceLast', { amount: fmt(cycleSpent) })}
                </div>
              )}
            </div>
          ) : (
            monthMetrics && isCurrentMonth && (
              <div className="insight-tile">
                <div className="insight-icon" aria-hidden="true">📅</div>
                <div className="insight-value text-tnum">{monthMetrics.daysLeft}</div>
                <div className="insight-label">
                  {monthMetrics.daysLeft === 1 ? t('dashboard.dayLeftOne') : t('dashboard.daysLeft')}
                </div>
              </div>
            )
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: features.multiMember ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 28 }}>
          {features.multiMember && (
            <div className="stat-card stat-card-primary">
              <span className="stat-icon" aria-hidden="true">👥</span>
              <div className="stat-value" style={{ color: 'var(--primary)' }}>{summary?.memberBreakdown?.length || 0}</div>
              <div className="stat-label">{t('dashboard.contributors')}</div>
            </div>
          )}
          <div className="stat-card stat-card-accent">
            <span className="stat-icon" aria-hidden="true">📂</span>
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{summary?.categoryBreakdown?.length || 0}</div>
            <div className="stat-label">{t('dashboard.categoriesUsed')}</div>
          </div>
        </div>
      )}

      {/* Daily-spend trend chart — interactive bars over backend dailyTrend.
          Each bar is a button; tapping selects it and the banner above updates.
          Today and peak get permanent badges so the user can see them even
          while another day is selected. */}
      {hasTrend && (
        <section style={{ marginBottom: 28 }}>
          <h3 className="section-title">{t('dashboard.dailyTrend')}</h3>
          <div className="surface-card trend-chart">
            {/* Sticky info banner — shows whichever day is currently selected */}
            {selectedBar && (
              <div className="trend-banner">
                <div className="trend-banner-left">
                  <span className="trend-banner-date">
                    {fmtDate(selectedBar.date, lang, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  <div className="trend-banner-badges">
                    {selectedBar.iso === todayIso && (
                      <span className="trend-badge trend-badge-today">{t('dashboard.trendToday')}</span>
                    )}
                    {selectedBar.iso === trendPeak?.iso && (
                      <span className="trend-badge trend-badge-peak">{t('dashboard.trendPeak')}</span>
                    )}
                  </div>
                </div>
                <div className="trend-banner-right">
                  <div className="trend-banner-amount text-tnum">
                    {selectedBar.total > 0 ? fmt(selectedBar.total) : t('dashboard.trendNoSpend')}
                  </div>
                  {selectedBar.total > 0 && trendAvg > 0 && selectedBar.iso !== trendPeak?.iso && (
                    <div className={`trend-banner-delta ${selectedBar.total >= trendAvg ? 'is-high' : 'is-low'}`}>
                      {selectedBar.total >= trendAvg
                        ? t('dashboard.trendVsAvgHigh', { pct: Math.round(((selectedBar.total - trendAvg) / trendAvg) * 100) })
                        : t('dashboard.trendVsAvgLow', { pct: Math.round(((trendAvg - selectedBar.total) / trendAvg) * 100) })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bar plot */}
            <div
              className="trend-plot"
              role="group"
              aria-label={t('dashboard.dailyTrend')}
            >
              {/* Dashed reference line at the daily-average mark */}
              {trendAvg > 0 && trendMax > 0 && (
                <div
                  className="trend-avg-line"
                  style={{ bottom: `${(trendAvg / trendMax) * 100}%` }}
                  aria-hidden="true"
                >
                  <span className="trend-avg-label text-tnum">
                    {t('dashboard.trendAvg', { amount: fmt(Math.round(trendAvg)) })}
                  </span>
                </div>
              )}

              <div className="trend-bars">
                {trendBars.map((b, i) => {
                  const pct = trendMax > 0 ? Math.max(b.total > 0 ? 6 : 3, Math.round((b.total / trendMax) * 100)) : 3;
                  const isToday = b.iso === todayIso;
                  const isPeak = b.total === trendMax && trendMax > 0 && b.iso === trendPeak?.iso;
                  const isSelected = b.iso === selectedTrendIso;
                  const dayNum = b.date.getDate();
                  const ariaLabel = `${fmtDate(b.date, lang, { weekday: 'long', day: 'numeric', month: 'long' })} — ${b.total > 0 ? fmt(b.total) : t('dashboard.trendNoSpend')}`;
                  return (
                    <button
                      key={b.iso}
                      type="button"
                      className={[
                        'trend-bar-btn',
                        isSelected && 'is-selected',
                        isPeak && 'is-peak',
                        isToday && 'is-today',
                        b.total === 0 && 'is-empty',
                      ].filter(Boolean).join(' ')}
                      onClick={() => setSelectedTrendIso(b.iso)}
                      aria-label={ariaLabel}
                      aria-pressed={isSelected}
                    >
                      {/* Marker dot above today and peak so they're always findable */}
                      {(isPeak || isToday) && (
                        <span className={`trend-marker ${isPeak ? 'is-peak' : 'is-today'}`} aria-hidden="true">
                          {isPeak ? '🔥' : '●'}
                        </span>
                      )}
                      <span
                        className="trend-bar-fill"
                        style={{ height: `${pct}%`, animationDelay: `${Math.min(i * 14, 420)}ms` }}
                      />
                      {/* Day number — only on tick positions (sparse labels) */}
                      {trendTicks.includes(i) && (
                        <span className="trend-bar-tick text-tnum" aria-hidden="true">{dayNum}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="trend-hint">{t('dashboard.trendHint')}</p>
          </div>
        </section>
      )}

      {/* Quick-add chips — 1-tap expense entry pre-selecting a category. */}
      {quickAddCats.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h3 className="section-title">{t('dashboard.quickAdd')}</h3>
          <div className="quick-add-row">
            {quickAddCats.map((catName) => {
              const cat = wedding?.categories?.find(c => c.name === catName);
              if (!cat) return null;
              return (
                <button
                  key={cat.name}
                  type="button"
                  className="quick-add-chip"
                  onClick={() => navigate(`/add?category=${encodeURIComponent(cat.name)}`)}
                  aria-label={t('dashboard.quickAddTo', { name: tCat(cat.name) })}
                >
                  <span className="qa-icon" aria-hidden="true">{cat.icon}</span>
                  <span className="qa-name">{tCat(cat.name)}</span>
                </button>
              );
            })}
            <button
              type="button"
              className="quick-add-chip quick-add-chip-more"
              onClick={() => navigate('/add')}
              aria-label={t('dashboard.quickAddCustom')}
            >
              <span className="qa-icon" aria-hidden="true">＋</span>
              <span className="qa-name">{t('dashboard.quickAddCustom')}</span>
            </button>
          </div>
        </section>
      )}

      {/* Two-column on tablet+ for Categories & Top Contributors */}
      <div className="grid-tablet-2">
        {/* Category Breakdown — tappable rows drill into the filtered list */}
        {hasCategories && summary && (
          <section style={{ marginBottom: 28 }}>
            <h3 className="section-title">{t('dashboard.spendingByCategory')}</h3>
            <div className="surface-card category-list" style={{ padding: 'var(--space-4)' }}>
              {(showAllCats ? summary.categoryBreakdown : summary.categoryBreakdown.slice(0, 6)).map((cat, idx, arr) => {
                const icon = wedding?.categories?.find(c => c.name === cat._id)?.icon || '📦';
                const pct = totalSpent > 0 ? Math.round((cat.total / totalSpent) * 100) : 0;
                const hue = getCategoryHue(cat._id);
                return (
                  <button
                    key={cat._id}
                    type="button"
                    className="category-row"
                    onClick={() => navigate(`${categoryListPath}?category=${encodeURIComponent(cat._id)}`)}
                    style={{
                      borderBottom: idx < arr.length - 1 ? '1px solid var(--divider)' : 'none',
                    }}
                  >
                    <span className="cat-icon" style={{ background: `hsla(${hue}, 70%, 55%, 0.12)` }}>{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                        <span className="cat-name">{tCat(cat._id)}</span>
                        <span className="text-tnum cat-amount">{fmt(cat.total)}</span>
                      </div>
                      <div className="cat-bar-bg">
                        <div
                          className="cat-bar-fill"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, hsl(${hue}, 80%, 60%), hsl(${hue}, 75%, 50%))`,
                          }}
                        />
                      </div>
                      <div className="cat-meta">
                        <span>{cat.count === 1 ? t('dashboard.catMetaOne') : t('dashboard.catMeta', { count: cat.count })}</span>
                        <span className="text-tnum">{pct}%</span>
                      </div>
                    </div>
                    <span className="cat-chevron" aria-hidden="true">›</span>
                  </button>
                );
              })}
              {summary.categoryBreakdown.length > 6 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs cat-show-more"
                  onClick={() => setShowAllCats(s => !s)}
                >
                  {showAllCats
                    ? t('dashboard.showLess')
                    : t('dashboard.showMoreCats', { count: summary.categoryBreakdown.length - 6 })}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Top Contributors — single-member verticals (Personal) hide this entirely */}
        {features.topContributors && hasContributors && summary && (
          <section style={{ marginBottom: 28 }}>
            <h3 className="section-title">{t('dashboard.topContributors')}</h3>
            <div className="stagger">
              {summary.memberBreakdown.slice(0, 5).map((m, i) => (
                <div key={m._id} className={`expense-item ${i === 0 ? 'podium-1' : i === 1 ? 'podium-2' : i === 2 ? 'podium-3' : ''}`}>
                  <div className="avatar" style={{ background: getColor(m.name), width: 42, height: 42, fontSize: '0.95rem' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (m.name || 'U')[0].toUpperCase()}
                  </div>
                  <div className="expense-info">
                    <h4>{m.name}</h4>
                    <p>
                      {m.count === 1
                        ? t('dashboard.contributorMetaOne', { relation: m.relation || t('members.relationFallback') })
                        : t('dashboard.contributorMeta', { relation: m.relation || t('members.relationFallback'), count: m.count })}
                    </p>
                  </div>
                  <div className="expense-amount">{fmt(m.total)}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Recent Activity — grouped by Today / Yesterday / This Week / Earlier */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 className="section-title" style={{ marginBottom: 0 }}>{t('dashboard.recentActivity')}</h3>
          {hasRecent && (
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => navigate(features.multiMember ? '/all-expenses' : '/my-expenses')}
            >
              {t('dashboard.viewAll')}
            </button>
          )}
        </div>
        {!hasRecent ? (
          <div className="surface-card empty-state" style={{ padding: 'var(--space-10) var(--space-5)' }}>
            <div className="emoji">📝</div>
            <h3>{t('dashboard.empty')}</h3>
            <p>{t('dashboard.emptyHint')}</p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ marginTop: 'var(--space-5)' }}
              onClick={() => navigate('/add')}
            >
              {t('dashboard.addFirstExpense')}
            </button>
          </div>
        ) : (
          <div className="activity-feed">
            {(['today', 'yesterday', 'week', 'earlier'] as const).map((groupId) => {
              const items = groupedRecent[groupId];
              if (!items.length) return null;
              const groupTotal = items.reduce((s, e) => s + e.amount, 0);
              return (
                <div key={groupId} className="activity-group">
                  <div className="activity-group-head">
                    <span className="activity-group-label">{t(`dashboard.group.${groupId}`)}</span>
                    <span className="text-tnum activity-group-total">{fmt(groupTotal)}</span>
                  </div>
                  <div className="stagger">
                    {items.map((exp) => {
                      const icon = wedding?.categories?.find(c => c.name === exp.category)?.icon || '📦';
                      return (
                        <div
                          key={exp._id}
                          className="expense-item"
                          onClick={() => setSelectedExpense(exp)}
                          style={{ cursor: 'pointer' }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && setSelectedExpense(exp)}
                        >
                          <div className="expense-icon">{icon}</div>
                          <div className="expense-info">
                            <h4>{exp.description || tCat(exp.category)}</h4>
                            <p>
                              {features.multiMember && (
                                <>{exp.memberId?.name || t('common.unknown')} • </>
                              )}
                              {fmtDate(exp.createdAt, lang)}
                            </p>
                            {exp.receiptUrl && (
                              <span className="receipt-badge" style={{ marginTop: 4 }}>
                                {t('receipt.badge')}
                              </span>
                            )}
                          </div>
                          <div className="expense-amount">{fmt(exp.amount)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Join Code Card */}
      {features.joinCode && wedding?.joinCode && (
        <div className="hero-card sparkle" style={{ textAlign: 'center', marginBottom: 16 }}>
          <p className="section-title" style={{ marginBottom: 8 }}>{t('dashboard.shareCode')}</p>
          <div className="text-tnum" style={{
            fontSize: '2rem',
            fontWeight: 800,
            letterSpacing: '8px',
            color: 'var(--primary-light)',
            marginBottom: 14,
          }}>
            {wedding.joinCode}
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              navigator.clipboard.writeText(wedding.joinCode);
              toast.success(t('common.codeCopied'));
            }}
          >
            {t('dashboard.copyCode')}
          </button>
        </div>
      )}

      {/* Expense Detail Sheet */}
      <ExpenseDetailSheet
        expense={selectedExpense}
        currency={currency}
        categoryIcon={wedding?.categories?.find(c => c.name === selectedExpense?.category)?.icon || '📦'}
        onClose={() => setSelectedExpense(null)}
        showMember={true}
      />
    </div>
  );
}
