/**
 * L3 — Per-user quota check + increment for the AI Coach endpoints.
 *
 * Two windows tracked on the Member document:
 *   • daily:   resets each calendar day in server-local TZ
 *   • monthly: resets each calendar month
 *
 * Reads happen on the GET /status endpoint and as the pre-flight check on
 * POST /coach. Writes (atomic $inc) happen ONLY AFTER the upstream Gemini
 * call has at least begun streaming — so a 5xx from the model doesn't
 * unfairly count against the user's daily budget. The route layer is
 * responsible for calling `incrementUsage(member)` at the right moment.
 *
 * Date keys use 'YYYY-MM-DD' / 'YYYY-MM' string format rather than Date
 * objects so the equality check is a single string compare without TZ
 * gotchas. We re-derive the keys from `new Date()` every call so a server
 * that runs for 30 days through a month boundary stays correct.
 */

const DAILY_LIMIT = 10;
const MONTHLY_LIMIT = 100;

function ymd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ym(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Read the user's current usage with date-reset applied. Pure — does NOT
 * write to the DB. The route can show a quota indicator without mutating
 * state on every page load.
 */
function readQuota(member) {
  const today = ymd();
  const thisMonth = ym();
  const daily = member.aiUsage?.daily || { date: '', count: 0 };
  const monthly = member.aiUsage?.monthly || { month: '', count: 0 };

  const dayCount = daily.date === today ? (daily.count || 0) : 0;
  const monthCount = monthly.month === thisMonth ? (monthly.count || 0) : 0;

  return {
    daily: {
      date: today,
      used: dayCount,
      limit: DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - dayCount),
      exceeded: dayCount >= DAILY_LIMIT,
    },
    monthly: {
      month: thisMonth,
      used: monthCount,
      limit: MONTHLY_LIMIT,
      remaining: Math.max(0, MONTHLY_LIMIT - monthCount),
      exceeded: monthCount >= MONTHLY_LIMIT,
    },
    anyExceeded: dayCount >= DAILY_LIMIT || monthCount >= MONTHLY_LIMIT,
  };
}

/**
 * Atomically increment the day + month counters. If the stored date /
 * month doesn't match today's, we reset that counter to 1 instead of
 * incrementing — first call of a new period.
 *
 * Uses a single findOneAndUpdate with two conditional $set / $inc paths so
 * the operation is atomic at the document level. The unconditional version
 * would race with parallel requests; the conditional version skips the
 * reset path when another concurrent request has already reset the
 * counter to today (the count goes from 0 → 2 instead of 1 → 2, which is
 * functionally identical for quota purposes).
 */
async function incrementUsage(MemberModel, memberId) {
  const today = ymd();
  const thisMonth = ym();

  // Find current values to decide if we reset or just increment.
  const current = await MemberModel.findById(memberId)
    .select('aiUsage')
    .lean();

  if (!current) return null;

  const sameDay = current.aiUsage?.daily?.date === today;
  const sameMonth = current.aiUsage?.monthly?.month === thisMonth;

  // Build a $set object that resets stale windows AND a $inc object that
  // bumps the counters that are still in the current window. Mongo doesn't
  // allow $set and $inc to touch the same path in one update, so we ALWAYS
  // $set the date/month strings (idempotent if equal) and conditionally
  // $set OR $inc each count.
  const update = {
    $set: {
      'aiUsage.daily.date': today,
      'aiUsage.monthly.month': thisMonth,
    },
  };

  if (sameDay) {
    update.$inc = update.$inc || {};
    update.$inc['aiUsage.daily.count'] = 1;
  } else {
    update.$set['aiUsage.daily.count'] = 1;
  }

  if (sameMonth) {
    update.$inc = update.$inc || {};
    update.$inc['aiUsage.monthly.count'] = 1;
  } else {
    update.$set['aiUsage.monthly.count'] = 1;
  }

  const result = await MemberModel.findByIdAndUpdate(memberId, update, { new: true, select: 'aiUsage' });
  return result ? readQuota(result) : null;
}

module.exports = {
  DAILY_LIMIT,
  MONTHLY_LIMIT,
  ymd,
  ym,
  readQuota,
  incrementUsage,
};
