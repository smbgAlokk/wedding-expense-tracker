// Pay-cycle math — derives the current pay-period window for a user with a
// fixed monthly pay day. The Dashboard's "Until next payday" runway tile
// queries the existing /expenses/summary endpoint with this window. The
// calendar-month report is *not* affected — runway is purely additive.
//
// Design choices, locked in for production:
//   1. payDay clamps to the last day of months that are shorter (e.g. 31 →
//      28/29 in Feb, 31 → 30 in April). This matches what subscription billers
//      (Netflix, Spotify, EMIs) do and is what users expect.
//   2. The cycle window is half-open: [cycleStart, cycleEnd). The day OF
//      payday belongs to the NEW cycle, not the closing one — i.e. on the
//      morning of payday the user sees a fresh window with ₹0 spent.
//   3. All math is done in the user's LOCAL timezone, then converted to ISO
//      at the API boundary. This matches the calendar-month logic in
//      Dashboard.tsx so the two date scopes stay consistent.

/**
 * Clamp a 1-31 pay day to the actual last day of the given month, if needed.
 *
 * @param payDay 1-31 (caller is responsible for validation)
 * @param year   Full year, e.g. 2026
 * @param month  0-indexed month (0 = January) — matches `Date.getMonth()`
 */
export function clampPayDay(payDay: number, year: number, month: number): number {
  // Day 0 of next month = last day of current month — the standard JS trick.
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(payDay, lastDay);
}

export interface PayCycle {
  /** Inclusive start of the cycle — midnight local time on the (clamped) pay day. */
  start: Date;
  /** Exclusive end of the cycle — midnight local time on the next (clamped) pay day. */
  end: Date;
  /** ISO strings suitable for the /expenses/summary range filter. */
  fromIso: string;
  toIso: string;
  /** Whole calendar days until `end`, never negative. 0 = payday is today. */
  daysUntilEnd: number;
  /** Calendar length of the cycle in days (28-32 typically). */
  cycleDays: number;
  /** 1-based day-of-cycle the reference date sits in, clamped to [1, cycleDays]. */
  elapsedDays: number;
}

/**
 * Compute the pay cycle that contains the given reference date.
 *
 * Example with payDay=6, ref=2026-05-15:
 *   start = 2026-05-06 00:00 local
 *   end   = 2026-06-06 00:00 local
 *   daysUntilEnd = 22, elapsedDays = 10, cycleDays = 31
 *
 * Example with payDay=31, ref=2026-02-15:
 *   thisMonthPayday clamps to 28, today (15) < 28
 *   start = 2026-01-31 00:00 local
 *   end   = 2026-02-28 00:00 local  (clamped — Feb has 28 days in 2026)
 *
 * @param payDay 1-31 (caller validates; behaviour outside that range is undefined)
 * @param ref    Reference moment. Defaults to "now". Time-of-day is normalized
 *               to midnight so daysUntilEnd is whole-day-based regardless of
 *               when the dashboard is opened.
 */
export function getCurrentPayCycle(payDay: number, ref: Date = new Date()): PayCycle {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const today = ref.getDate();

  const thisMonthPayday = clampPayDay(payDay, year, month);

  // Anchor: midnight today, used so daysUntilEnd doesn't shift by a fractional
  // amount mid-day. The user's perception of "days until X" is whole-day-based.
  const todayMidnight = new Date(year, month, today);

  let start: Date;
  let end: Date;

  if (today >= thisMonthPayday) {
    // We are AT or PAST this month's payday → cycle is [thisMonthPayday, nextMonthPayday)
    start = new Date(year, month, thisMonthPayday);
    const nextPayday = clampPayDay(payDay, year, month + 1);
    end = new Date(year, month + 1, nextPayday);
  } else {
    // BEFORE this month's payday → cycle is [prevMonthPayday, thisMonthPayday)
    const prevPayday = clampPayDay(payDay, year, month - 1);
    start = new Date(year, month - 1, prevPayday);
    end = new Date(year, month, thisMonthPayday);
  }

  const msPerDay = 86_400_000;
  // Math.ceil because partial days remaining should still count as a full day
  // in the "X days until payday" copy — 23h59m to payday reads as "1 day", not 0.
  const daysUntilEnd = Math.max(0, Math.ceil((end.getTime() - todayMidnight.getTime()) / msPerDay));
  const cycleDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / msPerDay));
  // elapsedDays is 1-based so day 1 of the cycle (payday morning) reads as
  // elapsedDays=1, not 0 — and we clamp to cycleDays so a future reference
  // date doesn't blow past the cycle length.
  const elapsedDays = Math.min(
    cycleDays,
    Math.max(1, Math.floor((todayMidnight.getTime() - start.getTime()) / msPerDay) + 1)
  );

  return {
    start,
    end,
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
    daysUntilEnd,
    cycleDays,
    elapsedDays,
  };
}
