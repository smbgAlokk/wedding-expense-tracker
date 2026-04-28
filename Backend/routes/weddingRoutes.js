const express = require('express');
const router = express.Router();
const validator = require('validator');
const Wedding = require('../models/Wedding');
const Member = require('../models/Member');
const { asyncHandler } = require('../middleware/errorHandler');
const { protect, adminOnly, generateToken } = require('../middleware/auth');

/**
 * POST /api/weddings
 * Create a new wedding (public - anyone can create)
 * Now requires email + password for the admin creator
 */
router.post('/', asyncHandler(async (req, res) => {
  const { weddingName, partner1, partner2, weddingDate, totalBudget, currency, adminName, adminRelation, adminPhone, email, password, confirmPassword } = req.body;

  // Validate required wedding fields
  if (!weddingName || !partner1 || !partner2 || !weddingDate) {
    return res.status(400).json({
      success: false,
      message: 'Please provide wedding name, couple names, and wedding date'
    });
  }

  if (!adminName) {
    return res.status(400).json({
      success: false,
      message: 'Please provide your name to create the wedding'
    });
  }

  // Validate email + password for admin
  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Please provide your email address'
    });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid email address'
    });
  }

  if (!password) {
    return res.status(400).json({
      success: false,
      message: 'Please create a password'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters'
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Passwords do not match'
    });
  }

  // Check if this email already has an admin account in another wedding
  // (allowed — one email can create multiple weddings)

  // Create the wedding
  const wedding = await Wedding.create({
    weddingName: weddingName.trim(),
    coupleNames: {
      partner1: partner1.trim(),
      partner2: partner2.trim()
    },
    weddingDate: new Date(weddingDate),
    totalBudget: totalBudget || 0,
    currency: currency || '₹'
  });

  // Create the admin member with email + hashed password
  const admin = await Member.create({
    weddingId: wedding._id,
    name: adminName.trim(),
    email: email.toLowerCase().trim(),
    password,
    authProvider: 'local',
    relation: adminRelation || 'Organizer',
    phone: adminPhone || '',
    role: 'admin'
  });

  // Link admin to wedding
  wedding.createdBy = admin._id;
  await wedding.save();

  // Generate token for admin
  const token = generateToken(admin._id);

  res.status(201).json({
    success: true,
    message: 'Wedding created successfully! Share the join code with family.',
    data: {
      wedding,
      member: admin,
      token,
      joinCode: wedding.joinCode
    }
  });
}));

/**
 * POST /api/weddings/join
 * Join an existing wedding with join code (public)
 */
router.post('/join', asyncHandler(async (req, res) => {
  const { joinCode, name, relation, phone } = req.body;

  if (!joinCode || !name) {
    return res.status(400).json({
      success: false,
      message: 'Please provide the wedding code and your name'
    });
  }

  // Find wedding by join code
  const wedding = await Wedding.findOne({
    joinCode: joinCode.toUpperCase().trim(),
    isActive: true
  });

  if (!wedding) {
    return res.status(404).json({
      success: false,
      message: 'No wedding found with this code. Please check and try again.'
    });
  }

  // Check if member with same name and phone already exists
  const existingMember = await Member.findOne({
    weddingId: wedding._id,
    name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    isActive: true
  });

  if (existingMember) {
    // Re-login existing member
    const token = generateToken(existingMember._id);
    return res.status(200).json({
      success: true,
      message: `Welcome back, ${existingMember.name}!`,
      data: {
        wedding,
        member: existingMember,
        token
      }
    });
  }

  // Create new member
  const member = await Member.create({
    weddingId: wedding._id,
    name: name.trim(),
    relation: relation || 'Family',
    phone: phone || '',
    role: 'member'
  });

  const token = generateToken(member._id);

  res.status(201).json({
    success: true,
    message: `Welcome, ${member.name}! You've joined ${wedding.weddingName}.`,
    data: {
      wedding,
      member,
      token
    }
  });
}));

/**
 * GET /api/weddings/current
 * Get current wedding details (protected)
 */
router.get('/current', protect, asyncHandler(async (req, res) => {
  const wedding = await Wedding.findById(req.weddingId)
    .populate('createdBy', 'name relation');

  if (!wedding) {
    return res.status(404).json({
      success: false,
      message: 'Wedding not found'
    });
  }

  // Get member count
  const memberCount = await Member.countDocuments({
    weddingId: wedding._id,
    isActive: true
  });

  res.status(200).json({
    success: true,
    data: {
      wedding,
      memberCount
    }
  });
}));

/**
 * PUT /api/weddings/current
 * Update wedding details (admin only)
 */
router.put('/current', protect, adminOnly, asyncHandler(async (req, res) => {
  const { weddingName, partner1, partner2, weddingDate, totalBudget, currency, categories } = req.body;

  const wedding = await Wedding.findById(req.weddingId);

  if (!wedding) {
    return res.status(404).json({
      success: false,
      message: 'Wedding not found'
    });
  }

  if (weddingName) wedding.weddingName = weddingName.trim();
  if (partner1) wedding.coupleNames.partner1 = partner1.trim();
  if (partner2) wedding.coupleNames.partner2 = partner2.trim();
  if (weddingDate) wedding.weddingDate = new Date(weddingDate);
  if (totalBudget !== undefined) wedding.totalBudget = totalBudget;
  if (currency) wedding.currency = currency;
  if (categories) wedding.categories = categories;

  await wedding.save();

  res.status(200).json({
    success: true,
    message: 'Wedding details updated',
    data: { wedding }
  });
}));

/**
 * GET /api/weddings/current/members
 * Get all members of the wedding (protected)
 */
router.get('/current/members', protect, asyncHandler(async (req, res) => {
  const members = await Member.find({
    weddingId: req.weddingId,
    isActive: true
  }).sort({ role: 1, createdAt: 1 });

  res.status(200).json({
    success: true,
    data: { members }
  });
}));

/**
 * DELETE /api/weddings/current/members/:memberId
 * Remove a member (admin only)
 */
router.delete('/current/members/:memberId', protect, adminOnly, asyncHandler(async (req, res) => {
  const member = await Member.findOne({
    _id: req.params.memberId,
    weddingId: req.weddingId
  });

  if (!member) {
    return res.status(404).json({
      success: false,
      message: 'Member not found'
    });
  }

  if (member.role === 'admin') {
    return res.status(400).json({
      success: false,
      message: 'Cannot remove the wedding admin'
    });
  }

  member.isActive = false;
  await member.save();

  res.status(200).json({
    success: true,
    message: `${member.name} has been removed`
  });
}));

module.exports = router;
