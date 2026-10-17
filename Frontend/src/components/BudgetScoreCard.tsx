import { useMemo } from 'react';
import { useLang } from '../context/LanguageContext';
import { useWedding } from '../context/WeddingContext';
import {
  aggregateSpendByBucket,
  computeBudgetScore,
} from '../constants/defaultCategories';
import { DEFAULT_BUDGET_ALLOCATION } from '../types';
import type { BudgetBucket } from '../types';

/**
 * L0 — Budget Score card.
 *
 * Compact card built around an SVG progress ring showing how closely the
 * user's actual N/W/S split matches their target allocation, plus a per-
 * bucket "actual vs target" mini-grid underneath.
 *
 * Self-contained: pulls categories + allocation from WeddingContext, derives
 * everything from `categoryBreakdown`. Renders nothing when:
 *   • workspace lacks `monthlyBudget` feature (Wedding/Trip), OR
 *   • no expenses in the period yet (caller can show its own "log more" hint)
 *
 * The same component will be re-used on the future /insights page; keeping it
 * a presentation component (no fetching of its own) means it composes cleanly
 * with the existing Dashboard summary fetch and a future analytics fetch.
 */
interface BudgetScoreCardProps {
  /** Spend totals by category name in the displayed period. */
  categoryBreakdown: Array<{ _id: string; total: number; count: number }>;
  /** Currency symbol, threaded through purely for ARIA hints. */
  currency?: string;
}

const RING_SIZE = 96;
const RING_STROKE = 9;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

export default function BudgetScoreCard({ categoryBreakdown }: BudgetScoreCardProps) {
  const { t } = useLang();
  const { wedding, features } = useWedding();

  const spendByBucket = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of categoryBreakdown || []) map[c._id] = c.total;
    return aggregateSpendByBucket(wedding?.categories || [], map);
  }, [categoryBreakdown, wedding?.categories]);

  const allocation = wedding?.budgetAllocation ?? DEFAULT_BUDGET_ALLOCATION;
  const { score, actualPct, deltaPct, isEmpty } = useMemo(
    () => computeBudgetScore(spendByBucket, allocation),
    [spendByBucket, allocation]
  );

  // Gate: only Personal (monthly-budget) verticals show this; wedding/trip
  // ignore. Empty state collapses to nothing — the caller decides what to do
  // when isEmpty is true (Dashboard shows its existing "no expenses" copy).
  if (!features.monthlyBudget) return null;
  if (isEmpty) return null;

  const scoreTone: 'good' | 'warn' | 'bad' =
    score >= 80 ? 'good' : score >= 50 ? 'warn' : 'bad';

  // Ring offset — full circumference at 0%, zero offset at 100%.
  const ringOffset = RING_CIRC - (Math.min(100, Math.max(0, score)) / 100) * RING_CIRC;

  // Verbal headline. Picks the single biggest deviation to call out — the
  // user gets ONE concrete signal per render, not three competing ones.
  const headline = useMemo(() => {
    const ordered = (['need', 'want', 'saving'] as const)
      .map((b) => ({ b, d: deltaPct[b] }))
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const top = ordered[0];
    // Threshold: ignore <3pp deltas; the score is "on target" then.
    if (Math.abs(top.d) < 3) return t('dashboard.score.headlineOnTarget');
    const dir = top.d > 0 ? 'over' : 'under';
    const key = `dashboard.score.headline.${top.b}.${dir}` as const;
    return t(key, { pct: Math.abs(top.d) });
  }, [deltaPct, t]);

  return (
    <section className={`score-card score-card-${scoreTone}`} aria-label={t('dashboard.score.cardLabel')}>
      <div className="score-card-grid">
        {/* Ring */}
        <div className="score-ring-wrap" role="img" aria-label={t('dashboard.score.ringAria', { score })}>
          <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="score-ring-svg">
            {/* Track */}
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke="var(--divider)"
              strokeWidth={RING_STROKE}
              fill="none"
            />
            {/* Progress (rotated so 0 sits at 12 o'clock) */}
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke="currentColor"
              strokeWidth={RING_STROKE}
              strokeDasharray={RING_CIRC}
              strokeDashoffset={ringOffset}
              strokeLinecap="round"
              fill="none"
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            />
          </svg>
          <div className="score-ring-value">
            <span className="text-tnum score-ring-num">{score}</span>
            <span className="score-ring-denom">/100</span>
          </div>
        </div>

        {/* Right column — label + headline + per-bucket grid */}
        <div className="score-content">
          <p className="section-title" style={{ marginBottom: 4 }}>{t('dashboard.score.title')}</p>
          <p className="score-headline">{headline}</p>

          <div className="score-buckets">
            {(['need', 'want', 'saving'] as const).map((b: BudgetBucket) => {
              const targetPct = allocation[b];
              const actPct = actualPct[b];
              const delta = deltaPct[b];
              return (
                <div key={b} className={`score-bucket score-bucket-${b}`}>
                  <span className="score-bucket-label">{t(`settings.alloc.${b}`)}</span>
                  <span className="score-bucket-actual text-tnum">{actPct}%</span>
                  <span className="score-bucket-target text-tnum">
                    {t('dashboard.score.target', { pct: targetPct })}
                  </span>
                  <span
                    className={`score-bucket-delta ${delta > 0 ? 'is-over' : delta < 0 ? 'is-under' : 'is-on'}`}
                    aria-label={delta === 0
                      ? t('dashboard.score.deltaOn')
                      : delta > 0
                        ? t('dashboard.score.deltaOver', { pct: delta })
                        : t('dashboard.score.deltaUnder', { pct: Math.abs(delta) })}
                  >
                    {delta === 0 ? '—' : delta > 0 ? `+${delta}` : `${delta}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
