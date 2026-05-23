const express = require('express');
const router = express.Router();
const validator = require('validator');
const Wedding = require('../models/Wedding');
const Member = require('../models/Member');
const { asyncHandler } = require('../middleware/errorHandler');
const { protect, adminOnly, generateToken } = require('../middleware/auth');
const { verifyGoogleCredential } = require('../utils/googleVerify');

/**
 * POST /api/weddings
 * Create a new wedding (public - anyone can create)
 * Now requires email + password for the admin creator
 */
router.post('/', asyncHandler(async (req, res) => {
  const { weddingName, partner1, partner2, weddingDate, totalBudget, currency, adminName, adminRelation, adminPhone, email, password, confirmPassword, googleCredential } = req.body;

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

  // Resolve the admin's identity — either via Google or via email + password.
  // (One email can create multiple weddings — that is allowed.)
  let adminEmail;
  let adminPassword;          // undefined for Google accounts (no password)
  let adminAuthProvider = 'local';
  let adminGoogleId;
  let adminAvatar;

  if (googleCredential) {
    let googleUser;
    try {
      googleUser = await verifyGoogleCredential(googleCredential);
    } catch (err) {
      return res.status(err.statusCode || 401).json({
        success: false,
        message: err.message
      });
    }
    adminEmail = googleUser.email;
    adminAuthProvider = 'google';
    adminGoogleId = googleUser.googleId;
    adminAvatar = googleUser.picture;
  } else {
    // Local: validate email + password for admin
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

    adminEmail = email.toLowerCase().trim();
    adminPassword = password;
  }

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

  // Create the admin member (password for local, googleId/avatar for Google)
  const admin = await Member.create({
    weddingId: wedding._id,
    name: adminName.trim(),
    email: adminEmail,
    ...(adminPassword ? { password: adminPassword } : {}),
    authProvider: adminAuthProvider,
    ...(adminGoogleId ? { googleId: adminGoogleId } : {}),
    ...(adminAvatar ? { avatar: adminAvatar } : {}),
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

  if (!joinCode || typeof joinCode !== 'string' || !name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Please provide the wedding code and your name'
    });
  }

  const trimmedName = name.trim();

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

  // Check if a member with the same name already exists (even if removed).
  // The name is matched LITERALLY — escaped, never interpolated as a raw regex.
  // A raw regex would allow injection / ReDoS and matching arbitrary members.
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existingMember = await Member.findOne({
    weddingId: wedding._id,
    name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') }
  }).select('+password');

  if (existingMember) {
    // SECURITY: frictionless name-based re-entry is ONLY for passwordless
    // members. Otherwise anyone holding the (widely shared) join code could
    // impersonate a credentialed user — including the admin — just by typing
    // their name, bypassing the password entirely. Credentialed accounts must
    // authenticate through Login.
    const isCredentialed =
      existingMember.role === 'admin' ||
      !!existingMember.email ||
      !!existingMember.googleId ||
      !!existingMember.password;

    if (isCredentialed) {
      return res.status(409).json({
        success: false,
        message: 'An account with this name already exists. Please use Login instead.'
      });
    }

    // If they were previously removed, reactivate them
    if (!existingMember.isActive) {
      existingMember.isActive = true;
      if (relation) existingMember.relation = relation;
      if (phone) existingMember.phone = phone;
      await existingMember.save();
    }
    existingMember.password = undefined;

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
    name: trimmedName,
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
