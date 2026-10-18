const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Expense = require('../../models/Expense');
const Wedding = require('../../models/Wedding');
const Member = require('../../models/Member');
const { asyncHandler } = require('../../middleware/errorHandler');
const { protect, adminOnly } = require('../../middleware/auth');
const { imageUpload } = require('../../middleware/imageUpload');
const { escapeRegexCapped } = require('../../utils/regex');
const {
  isConfigured: isCloudinaryConfigured,
  uploadToCloudinary,
  deleteFromCloudinary,
} = require('../../integrations/cloudinary');

const receiptUpload = imageUpload('receipt', { label: 'Receipt image', maxMB: 5 });

// Parse the optional `from` + `to` ISO timestamps used by Personal-vertical
// month scoping. Client sends the exact range it wants (computed from the
// user's local-time month boundaries) so the server doesn't have to guess at
// timezones. Returns a Mongo $gte/$lt filter or null. Defensive: invalid dates
// are silently ignored — the caller falls back to the all-time query.
function parseDateRange(fromStr, toStr) {
  const filter = {};
  if (fromStr && typeof fromStr === 'string') {
    const from = new Date(fromStr);
    if (!isNaN(from.getTime())) filter.$gte = from;
  }
  if (toStr && typeof toStr === 'string') {
    const to = new Date(toStr);
    if (!isNaN(to.getTime())) filter.$lt = to;
  }
  return Object.keys(filter).length ? filter : null;
}

// Strict: rejects '10abc', NaN, Infinity, ≤ 0 and absurd values that would poison totals.
const MAX_AMOUNT = 1e10;
const parseAmount = (v) => {
  const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT ? n : null;
};
const invalidAmount = (res) => res.status(400).json({ success: false, message: 'Please enter a valid amount.' });

/**
 * POST /api/expenses
 * Add a new expense (protected)
 * Accepts multipart/form-data (with optional receipt image) OR JSON
 */
router.post('/', protect, receiptUpload, asyncHandler(async (req, res) => {
  const { amount, category, description, paidBy, vendor, notes } = req.body;

  if (!amount || typeof category !== 'string' || !category.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Please provide the amount and category'
    });
  }

  const value = parseAmount(amount);
  if (value === null) return invalidAmount(res);

  // Validate category exists in wedding
  const wedding = await Wedding.findById(req.weddingId);
  const validCategory = wedding?.categories.find(
    c => c.name.toLowerCase() === category.toLowerCase()
  );

  if (!validCategory) {
    return res.status(400).json({
      success: false,
      message: `"${category}" is not a valid category. Please choose from the available categories.`
    });
  }

  // ─── Upload receipt to Cloudinary (optional) ────────────────────────
  // Receipt is optional. We never block the expense from being saved if the
  // upload fails — but we DO surface a warning so the client can tell the user
  // their receipt didn't attach (silent failures are a UX trap).
  let receiptUrl = '';
  let receiptPublicId = '';
  let receiptWarning = null;

  if (req.file) {
    if (!isCloudinaryConfigured()) {
      req.log.warn('receipt upload: Cloudinary not configured — receipt skipped');
      receiptWarning = 'Receipt storage is not configured. Expense saved without receipt.';
    } else {
      try {
        const result = await uploadToCloudinary(req.file.buffer, { folder: `wedding-receipts/${req.weddingId}` });
        receiptUrl = result.url;
        receiptPublicId = result.publicId;
      } catch (uploadErr) {
        req.log.error({ err: uploadErr.message }, 'receipt upload: Cloudinary error');
        receiptWarning = 'Could not upload receipt. Expense saved — you can re-add the receipt later.';
      }
    }
  }

  const expense = await Expense.create({
    weddingId: req.weddingId,
    memberId: req.member._id,
    amount: value,
    category: validCategory.name,
    description: description || '',
    paidBy: paidBy || req.member.name,
    vendor: vendor || '',
    notes: notes || '',
    receiptUrl,
    receiptPublicId,
  });

  // Populate member info
  await expense.populate('memberId', 'name relation');

  res.status(201).json({
    success: true,
    message: 'Expense added successfully!',
    warning: receiptWarning,
    data: { expense }
  });
}));

/**
 * GET /api/expenses
 * Get all expenses for the wedding (protected)
 */
router.get('/', protect, asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 50, category, memberId, sortBy = 'createdAt', order = 'desc',
    searchCategory, searchDesc, searchMember,
    from, to                                       // optional date-range scoping (Personal monthly view)
  } = req.query;

  // Pagination cap (audit Day 2, 2026-05-28). Without a server-side ceiling a
  // single request can ask for every expense in the workspace, defeating the
  // purpose of pagination and giving slow-loris callers an easy DB-pressure
  // multiplier. Bounded to [1, 100]; legitimate UI never asks for more than 50.
  const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const cappedPage = Math.max(parseInt(page, 10) || 1, 1);

  const query = { weddingId: req.weddingId };

  // Existing exact matches (chips)
  if (category) query.category = category;
  if (memberId) query.memberId = memberId;

  // Optional createdAt range (Personal month scoping; Wedding/Trip ignore).
  const dateRange = parseDateRange(from, to);
  if (dateRange) query.createdAt = dateRange;

  // Header column searches — user input MUST be regex-escaped and length-capped
  // before flowing into a `$regex` clause (audit H-7, 2026-05-28). Raw input
  // allows ReDoS via pathological patterns AND `.*`-style over-match across the
  // whole tenant. escapeRegexCapped handles both.
  if (searchCategory) {
    query.category = { $regex: escapeRegexCapped(searchCategory), $options: 'i' };
  }
  if (searchDesc) {
    query.description = { $regex: escapeRegexCapped(searchDesc), $options: 'i' };
  }

  if (searchMember) {
    // 1. Find members matching the name
    const members = await Member.find({
      weddingId: req.weddingId,
      name: { $regex: escapeRegexCapped(searchMember), $options: 'i' }
    }).select('_id').lean();
    
    const memberIds = members.map(m => m._id);
    
    // 2. Add to query (intersecting with memberId if existing)
    if (query.memberId) {
      if (!memberIds.some(id => id.toString() === query.memberId.toString())) {
         query.memberId = null; // Forces empty result if memberId doesn't match search
      }
    } else {
      query.memberId = { $in: memberIds };
    }
  }

  const skip = (cappedPage - 1) * cappedLimit;
  const sortOrder = order === 'asc' ? 1 : -1;
  const validSortFields = ['createdAt', 'amount', 'category', 'description'];
  const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

  const [expenses, total] = await Promise.all([
    Expense.find(query)
      .populate('memberId', 'name relation role')
      .sort({ [actualSortBy]: sortOrder })
      .skip(skip)
      .limit(cappedLimit)
      .lean(),
    Expense.countDocuments(query)
  ]);

  res.status(200).json({
    success: true,
    data: {
      expenses,
      pagination: {
        total,
        page: cappedPage,
        pages: Math.ceil(total / cappedLimit),
        limit: cappedLimit
      }
    }
  });
}));

/**
 * GET /api/expenses/my
 * Get current member's expenses (protected)
 */
router.get('/my', protect, asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const myQuery = {
    weddingId: req.weddingId,
    memberId: req.member._id,
  };
  const dateRange = parseDateRange(from, to);
  if (dateRange) myQuery.createdAt = dateRange;

  const expenses = await Expense.find(myQuery)
    .sort({ createdAt: -1 })
    .lean();

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

  res.status(200).json({
    success: true,
    data: {
      expenses,
      totalSpent,
      count: expenses.length
    }
  });
}));

/**
 * GET /api/expenses/summary
 * Get expense summary with aggregations (protected)
 */
router.get('/summary', protect, asyncHandler(async (req, res) => {
  const weddingId = new mongoose.Types.ObjectId(req.weddingId);
  const { from, to } = req.query;

  // Optional createdAt range (Personal-vertical month scoping). When present,
  // every aggregation below filters to the range so the dashboard reflects the
  // month the user is viewing; when absent, the dashboard shows lifetime totals
  // (the legacy Wedding/Trip behaviour).
  const dateRange = parseDateRange(from, to);
  const scopedMatch = dateRange
    ? { weddingId, createdAt: dateRange }
    : { weddingId };

  // Daily-trend window: when month-scoped, mirror the selected range so the
  // trend chart reflects the month; otherwise the legacy last-30-days window.
  let trendMatch;
  if (dateRange) {
    trendMatch = { weddingId, createdAt: dateRange };
  } else {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    trendMatch = { weddingId, createdAt: { $gte: thirtyDaysAgo } };
  }

  // Every query below is independent — fire them concurrently so the dashboard
  // pays ONE network round-trip to Atlas instead of six sequential ones.
  const [
    totalResultArr,
    categoryBreakdown,
    memberBreakdown,
    recentExpenses,
    dailyTrend,
    wedding,
  ] = await Promise.all([
    // Total expenses
    Expense.aggregate([
      { $match: scopedMatch },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),

    // Category breakdown
    Expense.aggregate([
      { $match: scopedMatch },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ]),

    // Member breakdown (top contributors)
    Expense.aggregate([
      { $match: scopedMatch },
      {
        $group: {
          _id: '$memberId',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } },
      {
        $lookup: {
          from: 'members',
          localField: '_id',
          foreignField: '_id',
          as: 'member'
        }
      },
      { $unwind: '$member' },
      {
        $project: {
          _id: 1,
          total: 1,
          count: 1,
          name: '$member.name',
          relation: '$member.relation',
          avatar: '$member.avatar'
        }
      }
    ]),

    // Recent expenses (last 10) — same range scoping as above
    Expense.find(dateRange ? { weddingId: req.weddingId, createdAt: dateRange } : { weddingId: req.weddingId })
      .populate('memberId', 'name relation')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),

    // Daily spending trend (last 30 days OR scoped month)
    Expense.aggregate([
      { $match: trendMatch },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),

    // Wedding budget
    Wedding.findById(req.weddingId),
  ]);

  const totalSpent = totalResultArr[0]?.total || 0;
  const totalCount = totalResultArr[0]?.count || 0;

  res.status(200).json({
    success: true,
    data: {
      totalSpent,
      totalCount,
      totalBudget: wedding?.totalBudget || 0,
      remaining: (wedding?.totalBudget || 0) - totalSpent,
      budgetUsedPercent: wedding?.totalBudget
        ? Math.round((totalSpent / wedding.totalBudget) * 100)
        : 0,
      categoryBreakdown,
      memberBreakdown,
      recentExpenses,
      dailyTrend,
      currency: wedding?.currency || '₹'
    }
  });
}));

/**
 * GET /api/expenses/analytics
 *
 * L1+L2 — Reports + Smart-Insights backing endpoint for the Personal-vertical
 * /insights page. Returns everything the Insights page needs in ONE round-
 * trip:
 *
 *   • Top-line KPIs (total, count, avg/day, biggest single expense)
 *   • categoryBreakdown — same shape as /summary, sorted desc
 *   • vendorBreakdown — top 10 vendors by spend (filtered out empty vendors)
 *   • trend — keyed by ISO date at the requested granularity (`day` or `month`)
 *   • dayOfWeekBreakdown — totals + count per day-of-week (0=Sun … 6=Sat)
 *   • prev — totals + categoryBreakdown for the equivalent previous window
 *     when caller supplies prevFrom + prevTo (L2 month-over-month rules)
 *   • recurringCandidates — vendors with stable monthly amounts in ≥2 of
 *     the last 3 months (L2 "possible subscription" detector). Independent
 *     90-day window — does NOT shift with the selected range, because
 *     recurring patterns are vendor-level facts, not range-relative
 *
 * Query params:
 *   from         ISO timestamp (inclusive lower bound)
 *   to           ISO timestamp (exclusive upper bound)
 *   granularity  'day' | 'month' (default 'day' when range ≤ 92 days else 'month')
 *   prevFrom     OPTIONAL ISO — previous-period lower bound (L2)
 *   prevTo       OPTIONAL ISO — previous-period upper bound (L2)
 *
 * Range bounds are REQUIRED to keep cost predictable — the Insights page
 * always supplies a range via the time-range picker. Missing/invalid range
 * defaults to "this calendar month" (the picker's default state) so a forged
 * empty query still produces something useful instead of an unbounded scan.
 *
 * SECURITY: workspace-scoped via the `protect` middleware which extracts
 * weddingId from the JWT-linked member. No cross-workspace data leakage.
 *
 * COST: re-uses the existing compound index (weddingId, createdAt). One
 * round-trip = six parallel Promise.all aggregations, same pattern as
 * /summary. Day-of-week aggregation uses Mongo's $dayOfWeek (1-indexed Sun=1)
 * and converts to 0-indexed in the response for JS consumer ergonomics.
 */
router.get('/analytics', protect, asyncHandler(async (req, res) => {
  const weddingId = new mongoose.Types.ObjectId(req.weddingId);
  const { from, to, prevFrom, prevTo } = req.query;

  // Resolve the date range. Defaults to this calendar month in the SERVER's
  // local timezone — the frontend always sends explicit from/to so this
  // default only kicks in for a malformed request.
  let dateRange = parseDateRange(from, to);
  if (!dateRange) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    dateRange = { $gte: monthStart, $lt: monthEnd };
  }

  // L2 — previous-period range for month-over-month rules. Both bounds must
  // be valid for the prev block to populate. We do NOT auto-infer a prev
  // range when caller omits these — frontend knows the period semantics
  // (e.g. "thisMonth" → previous calendar month, "last3M" → 3 months prior),
  // and inferring on the server would couple us to those semantics.
  const prevRange = parseDateRange(prevFrom, prevTo);

  // Auto-select granularity if not explicit:
  //   • Span ≤ 92 days → daily (3-month-or-less views get bar-per-day)
  //   • Else            → monthly (12-month views get bar-per-month)
  // The frontend can override either way via ?granularity=.
  const spanMs = (dateRange.$lt && dateRange.$gte)
    ? dateRange.$lt.getTime() - dateRange.$gte.getTime()
    : 0;
  const spanDays = Math.max(1, Math.round(spanMs / 86_400_000));
  const explicitGran = req.query.granularity;
  const granularity = (explicitGran === 'day' || explicitGran === 'month')
    ? explicitGran
    : (spanDays <= 92 ? 'day' : 'month');

  const trendFormat = granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';

  const scopedMatch = { weddingId, createdAt: dateRange };

  // Cap vendor leaderboard to a sane number — anyone with 10+ distinct
  // vendors per month is already power-user territory; UI shows top 10.
  const VENDOR_LIMIT = 10;

  // L2 — recurring detection runs over an INDEPENDENT trailing 90-day
  // window (3 calendar months back from "now"). It's intentionally NOT
  // shifted by the selected range — recurring patterns are vendor-level
  // facts about the user's life, not range-relative metrics. Picking a YTD
  // range shouldn't hide the fact that Netflix charges them every month.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);

  const [
    totalResultArr,
    biggestExpenseArr,
    categoryBreakdown,
    vendorBreakdown,
    trend,
    dayOfWeekBreakdown,
    wedding,
    prevTotalArr,
    prevCategoryBreakdown,
    recurringRaw,
  ] = await Promise.all([
    Expense.aggregate([
      { $match: scopedMatch },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    // Biggest single expense — project just what we need, never the whole doc
    Expense.aggregate([
      { $match: scopedMatch },
      { $sort: { amount: -1 } },
      { $limit: 1 },
      { $project: { _id: 1, amount: 1, category: 1, description: 1, vendor: 1, createdAt: 1 } },
    ]),

    Expense.aggregate([
      { $match: scopedMatch },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),

    Expense.aggregate([
      { $match: scopedMatch },
      // Strip whitespace + skip blanks so '' / '   ' / null all group together
      { $project: { amount: 1, vendor: { $trim: { input: { $ifNull: ['$vendor', ''] } } } } },
      { $match: { vendor: { $ne: '' } } },
      { $group: { _id: '$vendor', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: VENDOR_LIMIT },
    ]),

    Expense.aggregate([
      { $match: scopedMatch },
      {
        $group: {
          _id: { $dateToString: { format: trendFormat, date: '$createdAt' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Day-of-week histogram. Mongo $dayOfWeek is 1=Sunday..7=Saturday; we
    // subtract 1 in the projection so the response is 0=Sunday..6=Saturday,
    // matching JS Date.getDay() — much easier for the frontend.
    Expense.aggregate([
      { $match: scopedMatch },
      { $group: { _id: { $dayOfWeek: '$createdAt' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $project: { _id: 0, day: { $subtract: ['$_id', 1] }, total: 1, count: 1 } },
      { $sort: { day: 1 } },
    ]),

    Wedding.findById(req.weddingId).select('totalBudget currency categories budgetAllocation'),

    // L2 — previous-period total. Skipped (resolves to empty array) when
    // caller doesn't supply prevFrom/prevTo so we don't pay the round-trip
    // for callers that don't need it (e.g. internal callers, future cache).
    prevRange ? Expense.aggregate([
      { $match: { weddingId, createdAt: prevRange } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]) : Promise.resolve([]),

    // L2 — previous-period category breakdown for MoM-by-category rules.
    prevRange ? Expense.aggregate([
      { $match: { weddingId, createdAt: prevRange } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]) : Promise.resolve([]),

    // L2 — recurring detection raw data. Groups expenses from the last 90
    // days by (vendor, year-month) so we can identify vendors with stable
    // monthly amounts across multiple months. Final stability filter runs
    // in JS below — keeping the aggregation simple keeps the pipeline
    // index-friendly. Blank vendors are filtered out same as the leaderboard.
    Expense.aggregate([
      { $match: { weddingId, createdAt: { $gte: ninetyDaysAgo } } },
      {
        $project: {
          amount: 1,
          vendor: { $trim: { input: { $ifNull: ['$vendor', ''] } } },
          ym: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        },
      },
      { $match: { vendor: { $ne: '' } } },
      {
        $group: {
          _id: { vendor: '$vendor', month: '$ym' },
          monthlyTotal: { $sum: '$amount' },
          monthlyCount: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.vendor',
          // Use addToSet so a vendor with multiple per-month groupings (can't
          // happen with current shape but defensive) doesn't double-count months.
          months: { $addToSet: '$_id.month' },
          monthlyTotals: { $push: '$monthlyTotal' },
        },
      },
      // Need at least 2 months for a recurring claim. months.1 exists =>
      // array length ≥ 2 — same idiom Mongo docs recommend for size checks.
      { $match: { 'months.1': { $exists: true } } },
      { $project: { _id: 0, vendor: '$_id', months: 1, monthlyTotals: 1 } },
    ]),
  ]);

  const totalSpent = totalResultArr[0]?.total || 0;
  const totalCount = totalResultArr[0]?.count || 0;
  const avgPerDay = spanDays > 0 ? Math.round(totalSpent / spanDays) : 0;

  // L2 — JS stability filter for recurring candidates. Mongo gave us all
  // vendors with ≥2 monthly groupings; we keep only those whose monthly
  // totals stay within ±15% of the mean (coefficient-of-variation ≤ 0.15).
  // This is what distinguishes "Netflix ₹199 every month" (stable) from
  // "Zomato ₹varies-wildly" (frequent but not recurring).
  const RECURRING_STABILITY_THRESHOLD = 0.15;
  const RECURRING_MAX = 8;
  const recurringCandidates = (recurringRaw || [])
    .map((r) => {
      const totals = Array.isArray(r.monthlyTotals) ? r.monthlyTotals.filter((n) => Number.isFinite(n) && n > 0) : [];
      const months = Array.isArray(r.months) ? r.months : [];
      if (totals.length < 2) return null;
      const mean = totals.reduce((s, n) => s + n, 0) / totals.length;
      if (mean <= 0) return null;
      // Population standard deviation — sample SD overcorrects for small n.
      const variance = totals.reduce((s, n) => s + (n - mean) ** 2, 0) / totals.length;
      const sd = Math.sqrt(variance);
      const cv = sd / mean;
      if (cv > RECURRING_STABILITY_THRESHOLD) return null;
      return {
        vendor: r.vendor,
        avgMonthlyAmount: Math.round(mean),
        monthsSeen: months.length,
        // Stability score in [0, 1] — higher = tighter month-to-month
        // consistency. UI uses this to sort the candidates.
        stability: Math.max(0, 1 - cv / RECURRING_STABILITY_THRESHOLD),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.stability - a.stability || b.avgMonthlyAmount - a.avgMonthlyAmount)
    .slice(0, RECURRING_MAX);

  // L2 — previous-period block. Null (not absent) when caller didn't supply
  // prev range, so the frontend can distinguish "feature not requested" from
  // "feature requested but no data" — important for the rule engine's
  // "first time user" detection.
  const prev = prevRange
    ? {
        totalSpent: prevTotalArr[0]?.total || 0,
        totalCount: prevTotalArr[0]?.count || 0,
        categoryBreakdown: prevCategoryBreakdown,
        from: prevRange.$gte,
        to: prevRange.$lt,
      }
    : null;

  res.status(200).json({
    success: true,
    data: {
      from: dateRange.$gte,
      to: dateRange.$lt,
      granularity,
      spanDays,
      totalSpent,
      totalCount,
      avgPerDay,
      biggestExpense: biggestExpenseArr[0] || null,
      categoryBreakdown,
      vendorBreakdown,
      trend,
      dayOfWeekBreakdown,
      totalBudget: wedding?.totalBudget || 0,
      currency: wedding?.currency || '₹',
      // L2 additions
      prev,
      recurringCandidates,
    },
  });
}));

/**
 * PUT /api/expenses/:id
 * Update an expense (owner or admin)
 */
router.put('/:id', protect, asyncHandler(async (req, res) => {
  const expense = await Expense.findOne({
    _id: req.params.id,
    weddingId: req.weddingId
  });

  if (!expense) {
    return res.status(404).json({
      success: false,
      message: 'Expense not found'
    });
  }

  // Only owner or admin can edit
  if (expense.memberId.toString() !== req.member._id.toString() && req.member.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'You can only edit your own expenses'
    });
  }

  const { amount, category, description, paidBy, vendor, notes } = req.body;

  if (amount !== undefined) {
    const value = parseAmount(amount);
    if (value === null) return invalidAmount(res);
    expense.amount = value;
  }
  if (category) {
    // Validate the new category against the wedding's list (same as create).
    const wedding = await Wedding.findById(req.weddingId);
    const validCategory = wedding?.categories.find(
      c => c.name.toLowerCase() === String(category).toLowerCase()
    );
    if (!validCategory) {
      return res.status(400).json({
        success: false,
        message: `"${category}" is not a valid category. Please choose from the available categories.`
      });
    }
    expense.category = validCategory.name;
  }
  if (description !== undefined) expense.description = description;
  if (paidBy) expense.paidBy = paidBy;
  if (vendor !== undefined) expense.vendor = vendor;
  if (notes !== undefined) expense.notes = notes;

  await expense.save();
  await expense.populate('memberId', 'name relation');

  res.status(200).json({
    success: true,
    message: 'Expense updated',
    data: { expense }
  });
}));

/**
 * DELETE /api/expenses/:id
 * Delete an expense (owner or admin)
 * Also cleans up the receipt from Cloudinary if present.
 */
router.delete('/:id', protect, asyncHandler(async (req, res) => {
  const expense = await Expense.findOne({
    _id: req.params.id,
    weddingId: req.weddingId
  });

  if (!expense) {
    return res.status(404).json({
      success: false,
      message: 'Expense not found'
    });
  }

  // Only owner or admin can delete
  if (expense.memberId.toString() !== req.member._id.toString() && req.member.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'You can only delete your own expenses'
    });
  }

  // Clean up Cloudinary receipt (fire-and-forget — don't block response)
  if (expense.receiptPublicId) {
    deleteFromCloudinary(expense.receiptPublicId);
  }

  await Expense.deleteOne({ _id: expense._id });

  res.status(200).json({
    success: true,
    message: 'Expense deleted'
  });
}));

module.exports = router;
