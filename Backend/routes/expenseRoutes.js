const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const Expense = require('../models/Expense');
const Wedding = require('../models/Wedding');
const Member = require('../models/Member');
const { asyncHandler } = require('../middleware/errorHandler');
const { protect, adminOnly } = require('../middleware/auth');
const {
  isConfigured: isCloudinaryConfigured,
  uploadToCloudinary,
  deleteFromCloudinary,
} = require('../utils/cloudinary');

// ─── Multer config — in-memory buffer, images only, 5 MB max ────────────────
const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPG, PNG, WebP, HEIC)'), false);
    }
  },
});

// Wrap multer so we can return a clean JSON error instead of crashing
const receiptUpload = (req, res, next) => {
  upload.single('receipt')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'Receipt image must be under 5 MB',
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`,
      });
    }
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'Invalid file',
      });
    }
    next();
  });
};

/**
 * POST /api/expenses
 * Add a new expense (protected)
 * Accepts multipart/form-data (with optional receipt image) OR JSON
 */
router.post('/', protect, receiptUpload, asyncHandler(async (req, res) => {
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

  // ─── Upload receipt to Cloudinary (optional) ────────────────────────
  // Receipt is optional. We never block the expense from being saved if the
  // upload fails — but we DO surface a warning so the client can tell the user
  // their receipt didn't attach (silent failures are a UX trap).
  let receiptUrl = '';
  let receiptPublicId = '';
  let receiptWarning = null;

  if (req.file) {
    if (!isCloudinaryConfigured()) {
      console.warn('[Receipt Upload] Cloudinary not configured — receipt skipped');
      receiptWarning = 'Receipt storage is not configured. Expense saved without receipt.';
    } else {
      try {
        const folder = `wedding-receipts/${req.weddingId}`;
        const result = await uploadToCloudinary(req.file.buffer, folder);
        receiptUrl = result.url;
        receiptPublicId = result.publicId;
      } catch (uploadErr) {
        console.error('[Receipt Upload] Cloudinary error:', uploadErr.message);
        receiptWarning = 'Could not upload receipt. Expense saved — you can re-add the receipt later.';
      }
    }
  }

  const expense = await Expense.create({
    weddingId: req.weddingId,
    memberId: req.member._id,
    amount: parseFloat(amount),
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
    searchCategory, searchDesc, searchMember
  } = req.query;

  const query = { weddingId: req.weddingId };

  // Existing exact matches (chips)
  if (category) query.category = category;
  if (memberId) query.memberId = memberId;

  // Header column searches
  if (searchCategory) {
    query.category = { $regex: searchCategory, $options: 'i' };
  }
  if (searchDesc) {
    query.description = { $regex: searchDesc, $options: 'i' };
  }
  
  if (searchMember) {
    // 1. Find members matching the name
    const members = await Member.find({ 
      weddingId: req.weddingId, 
      name: { $regex: searchMember, $options: 'i' } 
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

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sortOrder = order === 'asc' ? 1 : -1;
  const validSortFields = ['createdAt', 'amount', 'category', 'description'];
  const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

  const [expenses, total] = await Promise.all([
    Expense.find(query)
      .populate('memberId', 'name relation role')
      .sort({ [actualSortBy]: sortOrder })
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

  // Daily spending trend window (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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
      { $match: { weddingId } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),

    // Category breakdown
    Expense.aggregate([
      { $match: { weddingId } },
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
    ]),

    // Recent expenses (last 10)
    Expense.find({ weddingId: req.weddingId })
      .populate('memberId', 'name relation')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),

    // Daily spending trend (last 30 days)
    Expense.aggregate([
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
