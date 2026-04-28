const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const Wedding = require('../models/Wedding');
const Member = require('../models/Member');
const { asyncHandler } = require('../middleware/errorHandler');
const { protect, adminOnly } = require('../middleware/auth');

/**
 * POST /api/expenses
 * Add a new expense (protected)
 */
router.post('/', protect, asyncHandler(async (req, res) => {
  const { amount, category, description, paidBy, vendor, notes } = req.body;

  if (!amount || !category) {
    return res.status(400).json({
      success: false,
      message: 'Please provide the amount and category'
    });
  }

  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Amount must be greater than zero'
    });
  }

  // Validate category exists in wedding
  const wedding = await Wedding.findById(req.weddingId);
  const validCategory = wedding.categories.find(
    c => c.name.toLowerCase() === category.toLowerCase()
  );

  if (!validCategory) {
    return res.status(400).json({
      success: false,
      message: `"${category}" is not a valid category. Please choose from the available categories.`
    });
  }

  const expense = await Expense.create({
    weddingId: req.weddingId,
    memberId: req.member._id,
    amount: parseFloat(amount),
    category: validCategory.name,
    description: description || '',
    paidBy: paidBy || req.member.name,
    vendor: vendor || '',
    notes: notes || ''
  });

  // Populate member info
  await expense.populate('memberId', 'name relation');

  res.status(201).json({
    success: true,
    message: 'Expense added successfully!',
    data: { expense }
  });
}));

/**
 * GET /api/expenses
 * Get all expenses for the wedding (protected)
 */
router.get('/', protect, asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, category, memberId, sortBy = 'createdAt', order = 'desc' } = req.query;

  const query = { weddingId: req.weddingId };

  if (category) query.category = category;
  if (memberId) query.memberId = memberId;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sortOrder = order === 'asc' ? 1 : -1;

  const [expenses, total] = await Promise.all([
    Expense.find(query)
      .populate('memberId', 'name relation role')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Expense.countDocuments(query)
  ]);

  res.status(200).json({
    success: true,
    data: {
      expenses,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      }
    }
  });
}));

/**
 * GET /api/expenses/my
 * Get current member's expenses (protected)
 */
router.get('/my', protect, asyncHandler(async (req, res) => {
  const expenses = await Expense.find({
    weddingId: req.weddingId,
    memberId: req.member._id
  })
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

  // Total expenses
  const [totalResult] = await Expense.aggregate([
    { $match: { weddingId } },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
  ]);

  const totalSpent = totalResult?.total || 0;
  const totalCount = totalResult?.count || 0;

  // Category breakdown
  const categoryBreakdown = await Expense.aggregate([
    { $match: { weddingId } },
    {
      $group: {
        _id: '$category',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { total: -1 } }
  ]);

  // Member breakdown (top contributors)
  const memberBreakdown = await Expense.aggregate([
    { $match: { weddingId } },
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
        relation: '$member.relation'
      }
    }
  ]);

  // Recent expenses (last 10)
  const recentExpenses = await Expense.find({ weddingId: req.weddingId })
    .populate('memberId', 'name relation')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  // Daily spending trend (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailyTrend = await Expense.aggregate([
    {
      $match: {
        weddingId,
        createdAt: { $gte: thirtyDaysAgo }
      }
    },
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
  ]);

  // Get wedding budget
  const wedding = await Wedding.findById(req.weddingId);

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

  if (amount !== undefined) expense.amount = parseFloat(amount);
  if (category) expense.category = category;
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

  await Expense.deleteOne({ _id: expense._id });

  res.status(200).json({
    success: true,
    message: 'Expense deleted'
  });
}));

module.exports = router;
