import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import { useWedding } from '../context/WeddingContext';
import { DEFAULT_BUDGET_ALLOCATION } from '../types';
import { fmtAmount } from '../utils/format';
import {
  computeInsights,
  loadDismissed,
  saveDismissed,
  type AnalyticsInput,
  type Insight,
} from '../utils/insightRules';

/**
 * L2 — Smart Insights cards on top of the /insights page.
 *
 * Presentation-only React wrapper around the pure-function `computeInsights`
 * rule engine. State held here is exclusively UI state (dismissal set, show-
 * dismissed toggle) — the rules themselves are pure and live in
 * Frontend/src/utils/insightRules.ts.
 *
 * Edge cases handled:
 *   • No rules fire (cold start) → component returns null; caller renders nothing
 *   • All cards dismissed → small affordance to "Show dismissed" reappears
 *   • Rule throws → caught upstream in computeInsights; we just see fewer cards
 *   • localStorage quota / private-mode → loadDismissed/saveDismissed silently degrade
 */
interface Props {
  analytics: AnalyticsInput;
}

export default function InsightCards({ analytics }: Props) {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const { wedding } = useWedding();

  // Read once on mount. Subsequent dismissal updates flow through setState
  // and persist via saveDismissed inside the click handler.
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [showDismissed, setShowDismissed] = useState(false);

  // Stable currency formatter — closure-captures `t` so number suffixes
  // (K/L/Cr) translate, matching the rest of the app.
  const currency = wedding?.currency || '₹';
  const fmt = useCallback(
    (n: number) => fmtAmount(n, currency, t),
    [currency, t],
  );

  // Memoize the rule engine output. Re-runs only when the data or the
  // dismissed set changes — switching language or theme is a no-op.
  const allocation = wedding?.budgetAllocation ?? DEFAULT_BUDGET_ALLOCATION;
  const effectiveDismissed = useMemo(() => (showDismissed ? new Set<string>() : dismissed), [showDismissed, dismissed]);
  const insights: Insight[] = useMemo(
    () => computeInsights(analytics, { wedding, allocation, t, fmt }, effectiveDismissed),
    [analytics, wedding, allocation, t, fmt, effectiveDismissed],
  );

  const handleDismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }, []);

  const handleRestoreAll = useCallback(() => {
    setDismissed(new Set());
    saveDismissed(new Set());
    setShowDismissed(false);
  }, []);

  const hasDismissed = dismissed.size > 0;

  if (insights.length === 0) {
    if (!hasDismissed) return null;
    // Empty state when all cards are dismissed — small affordance to unbury them.
    return (
      <section className="insights-cards-empty" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={handleRestoreAll}
          aria-label={t('insights.dismissed.restoreAria')}
        >
          {t('insights.dismissed.restore', { count: dismissed.size })}
        </button>
      </section>
    );
  }

  return (
    <section className="insights-cards" aria-label={t('insights.cards.label')} style={{ marginBottom: 16 }}>
      {insights.map((i) => (
        <article
          key={i.id}
          className={`insight-card insight-card-${i.severity}`}
          // role="status" makes assistive tech announce new cards politely;
          // matches the WAI-ARIA pattern for a "live region" of insights.
          role="status"
        >
          <div className="insight-card-icon" aria-hidden="true">{i.icon}</div>
          <div className="insight-card-body">
            <h4 className="insight-card-title">{i.title}</h4>
            <p className="insight-card-text" lang={lang}>{i.body}</p>
            {i.actionLabel && i.actionHref && (
              <button
                type="button"
                className="insight-card-action"
                onClick={() => navigate(i.actionHref!)}
              >
                {i.actionLabel} →
              </button>
            )}
          </div>
          <button
            type="button"
            className="insight-card-dismiss"
            onClick={() => handleDismiss(i.id)}
            aria-label={t('insights.cards.dismissAria')}
            title={t('insights.cards.dismissTitle')}
          >
            ✕
          </button>
        </article>
      ))}
      {hasDismissed && !showDismissed && (
        <button
          type="button"
          className="btn btn-ghost btn-xs insights-cards-show-dismissed"
          onClick={() => setShowDismissed(true)}
        >
          {t('insights.dismissed.show', { count: dismissed.size })}
        </button>
      )}
      {showDismissed && (
        <button
          type="button"
          className="btn btn-ghost btn-xs insights-cards-show-dismissed"
          onClick={() => setShowDismissed(false)}
        >
          {t('insights.dismissed.hide')}
        </button>
      )}
    </section>
  );
}
