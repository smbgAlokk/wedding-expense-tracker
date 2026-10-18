import { useMemo } from 'react';
import { useLang } from '@/context/LanguageContext';

/**
 * L1 — Time range picker for the /insights page.
 *
 * Preset chips: This month · Last month · Last 3M · Last 6M · Last 12M · YTD
 *
 * Why presets only (no custom-date picker in v1):
 *   • The six presets cover ~95% of real personal-finance review needs
 *   • A native <input type="date"> picker is browser-inconsistent and
 *     mobile-keyboard-hostile (Android Chrome shows a 3-step modal)
 *   • Custom range will land in L1β as a separate component if owner asks;
 *     not blocking the main analytics ship
 *
 * The picker is a CONTROLLED component — parent owns `value` (the preset
 * key) and the resolved {from, to} ISO range. The parent resolves with
 * resolveRange(value) on mount and whenever value changes.
 */
export type RangePreset =
  | 'thisMonth'
  | 'lastMonth'
  | 'last3M'
  | 'last6M'
  | 'last12M'
  | 'ytd';

export const RANGE_PRESETS: readonly RangePreset[] = [
  'thisMonth',
  'lastMonth',
  'last3M',
  'last6M',
  'last12M',
  'ytd',
] as const;

export interface ResolvedRange {
  /** Inclusive lower bound as ISO. */
  from: string;
  /** Exclusive upper bound as ISO. Mongo $lt semantics. */
  to: string;
  /**
   * Equivalent PREVIOUS window for month-over-month rules (L2). For partial
   * windows that include "today" (e.g. last3M, YTD), we deliberately use the
   * SAME calendar length immediately preceding so comparisons are apples-to-
   * apples — comparing "May 1 → May 15" against "April 1 → April 15", not
   * "all of April". Returns null only when the preset has no meaningful
   * previous comparison (none today; all six presets define one).
   */
  prevFrom: string;
  prevTo: string;
}

/**
 * Resolve a preset key into a concrete {from, to} ISO range pair PLUS the
 * equivalent previous-window range for L2 month-over-month rules. All math
 * is done in the user's LOCAL timezone (same convention as the existing
 * Dashboard month switcher and the pay-cycle util) so the boundaries line
 * up with how the user thinks of "this month" / "last month" / "YTD".
 *
 * Previous-window semantics:
 *   • thisMonth   → previous calendar month (full month, even if current is partial)
 *   • lastMonth   → month before that (full)
 *   • last3M-12M  → same calendar-length window immediately preceding `from`
 *   • ytd         → same calendar length one year prior (e.g. Jan-May 2025)
 *
 * `to` is always EXCLUSIVE (Mongo $lt semantics).
 */
export function resolveRange(preset: RangePreset, ref: Date = new Date()): ResolvedRange {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  // Helper: start of the day after `ref` (so "to" is exclusive for today).
  const tomorrow = new Date(y, m, ref.getDate() + 1);

  let from: Date;
  let to: Date;
  let prevFrom: Date;
  let prevTo: Date;

  switch (preset) {
    case 'thisMonth':
      from = new Date(y, m, 1);
      to = new Date(y, m + 1, 1);
      // Compare full last month vs current calendar month — even if current
      // is partial. Otherwise on day 1 of a new month there's nothing to
      // compare; the rule engine handles "current much smaller than prev"
      // with its noise-floor filter.
      prevFrom = new Date(y, m - 1, 1);
      prevTo = new Date(y, m, 1);
      break;
    case 'lastMonth':
      from = new Date(y, m - 1, 1);
      to = new Date(y, m, 1);
      prevFrom = new Date(y, m - 2, 1);
      prevTo = new Date(y, m - 1, 1);
      break;
    case 'last3M':
      from = new Date(y, m - 2, 1);
      to = tomorrow;
      // Same calendar length immediately preceding (3 calendar months).
      prevFrom = new Date(y, m - 5, 1);
      prevTo = new Date(y, m - 2, 1);
      break;
    case 'last6M':
      from = new Date(y, m - 5, 1);
      to = tomorrow;
      prevFrom = new Date(y, m - 11, 1);
      prevTo = new Date(y, m - 5, 1);
      break;
    case 'last12M':
      from = new Date(y, m - 11, 1);
      to = tomorrow;
      prevFrom = new Date(y, m - 23, 1);
      prevTo = new Date(y, m - 11, 1);
      break;
    case 'ytd':
      from = new Date(y, 0, 1);
      to = tomorrow;
      // Same calendar window one year prior — Jan 1 → today's date last year.
      prevFrom = new Date(y - 1, 0, 1);
      prevTo = new Date(y - 1, m, ref.getDate() + 1);
      break;
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    prevFrom: prevFrom.toISOString(),
    prevTo: prevTo.toISOString(),
  };
}

interface Props {
  value: RangePreset;
  onChange: (next: RangePreset) => void;
}

export default function TimeRangePicker({ value, onChange }: Props) {
  const { t } = useLang();

  // Stable preset list — memoization is overkill but consistent with the
  // codebase's "useMemo for derived UI lists" pattern.
  const presets = useMemo(() => RANGE_PRESETS, []);

  return (
    <div className="range-picker" role="tablist" aria-label={t('insights.range.label')}>
      {presets.map((p) => {
        const isActive = p === value;
        return (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`range-chip ${isActive ? 'is-active' : ''}`}
            onClick={() => onChange(p)}
          >
            {t(`insights.range.${p}`)}
          </button>
        );
      })}
    </div>
  );
}
