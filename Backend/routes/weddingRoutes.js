const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const validator = require('validator');
const Wedding = require('../models/Wedding');
const Member = require('../models/Member');
const { asyncHandler } = require('../middleware/errorHandler');
const { protect, adminOnly, issueSession } = require('../middleware/auth');
const { verifyGoogleCredential } = require('../utils/googleVerify');
const { verifyTurnstile } = require('../utils/turnstile');
const { escapeRegex } = require('../utils/regex');
const { sendVerificationEmail } = require('../utils/email');
const { mintEmailVerificationToken } = require('../utils/verificationToken');
const { recordAudit } = require('../utils/audit');

// Local copy of authRoutes.js's frontendBaseUrl helper. Both files build URLs
// off FRONTEND_URL (comma-separated list — first entry wins, trailing slash
// stripped) for emailed links. Kept in sync deliberately; the duplication is
// 1 line and avoids a fragile cross-route import.
const frontendBaseUrl = () =>
  (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '');

// Stricter than the global authLimiter (audit H-3, 2026-05-28). Signups are
// infrequent legitimate actions — disposable signup spam is the primary abuse
// vector (bcrypt-rounds-12 CPU burn + Atlas storage exhaustion). 10/hour per
// IP is roomy for one human + their phone but cuts botnet throughput by ~20x.
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many signup attempts. Please try again in an hour.' },
});

/**
 * POST /api/weddings
 * Create a new wedding (public - anyone can create)
 * Now requires email + password for the admin creator
 */
router.post('/', signupLimiter, asyncHandler(async (req, res) => {
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

  // H-8: CAPTCHA gate on signup (no-op unless TURNSTILE_SECRET configured).
  const captcha = await verifyTurnstile(req.body.turnstileToken, req.ip);
  if (!captcha.success) {
    return res.status(400).json({
      success: false,
      message: 'Captcha verification failed. Please try again.'
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

  // H-5 (2026-05-28): pre-mint verification token for the local-auth path so
  // the hash + expiry land inside the Member.create payload (one DB write
  // instead of a follow-up save). Google-auth admins skip verification —
  // googleVerify already enforces email_verified=true upstream.
  const verification = adminAuthProvider === 'local' ? mintEmailVerificationToken() : null;

  // Audit M-5 (2026-05-28): atomic workspace+admin creation. The three writes
  // (Wedding.create → Member.create → wedding.save) used to run as separate
  // awaits — if step 2 or 3 failed, an orphan Wedding with no createdBy stuck
  // around forever. Atlas is a replica set, so Mongoose transactions work.
  let wedding, admin;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      [wedding] = await Wedding.create([{
        weddingName: weddingName.trim(),
        coupleNames: {
          partner1: partner1.trim(),
          partner2: partner2.trim()
        },
        weddingDate: new Date(weddingDate),
        totalBudget: totalBudget || 0,
        currency: currency || '₹'
      }], { session });

      [admin] = await Member.create([{
        weddingId: wedding._id,
        name: adminName.trim(),
        email: adminEmail,
        ...(adminPassword ? { password: adminPassword } : {}),
        authProvider: adminAuthProvider,
        ...(adminGoogleId ? { googleId: adminGoogleId } : {}),
        ...(adminAvatar ? { avatar: adminAvatar } : {}),
        relation: adminRelation || 'Organizer',
        phone: adminPhone || '',
        role: 'admin',
        ...(adminAuthProvider === 'google'
          ? { emailVerifiedAt: new Date() }
          : { emailVerificationToken: verification.tokenHash, emailVerificationExpires: verification.expiresAt }),
      }], { session });

      wedding.createdBy = admin._id;
      await wedding.save({ session });
    });
  } finally {
    await session.endSession();
  }

  // C-2: issue the session via HttpOnly cookies (access + rotating refresh +
  // csrf). Outside the transaction — cookie/refresh issuance has no Wedding/
  // Member write to roll back. The response no longer carries a `token`.
  await issueSession(res, req, admin);

  // H-5: send the verification email fire-and-forget AFTER the transaction
  // commits. We never block signup response on SMTP latency, and we never
  // send for a transaction that may roll back. Failure is logged + ignored —
  // the user can resend via /api/auth/resend-verification.
  if (verification) {
    const verifyUrl = `${frontendBaseUrl()}/verify-email?token=${verification.rawToken}`;
    sendVerificationEmail(adminEmail, verifyUrl, admin.name).catch((err) => {
      console.error('[wedding-create] verification email send failed:', err.message);
    });
  }

  res.status(201).json({
    success: true,
    message: 'Wedding created successfully! Share the join code with family.',
    data: {
      wedding,
      member: admin,
      joinCode: wedding.joinCode
    }
  });
}));

/**
 * POST /api/weddings/personal
 * Create a Personal-vertical workspace (single-user monthly budget). No
 * join code, no co-owners — the signed-up user becomes the sole admin and
 * the only member of the workspace.
 *
 * Multi-vertical Phase 2 (2026-05-27). Sits under /api/weddings/ because
 * Phase 0b (the route-level rename to /api/workspaces/) is deferred — see
 * MASTER_CONTEXT.md §9.6 Phase 0b. The Wedding model is the underlying
 * storage container; `type: 'personal'` selects the personal feature set.
 */
router.post('/personal', signupLimiter, asyncHandler(async (req, res) => {
  const {
    name,                // optional — workspace name shown in UI (defaults to "<adminName>'s Budget")
    monthlyBudget,       // optional — defaults to 0
    currency,            // optional — defaults to ₹
    adminName,
    email,
    password,
    confirmPassword,
    googleCredential,
  } = req.body;

  if (!adminName || typeof adminName !== 'string' || !adminName.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Please provide your name to create your personal budget'
    });
  }

  // H-8: CAPTCHA gate on signup (no-op unless TURNSTILE_SECRET configured).
  const captcha = await verifyTurnstile(req.body.turnstileToken, req.ip);
  if (!captcha.success) {
    return res.status(400).json({
      success: false,
      message: 'Captcha verification failed. Please try again.'
    });
  }

  // Resolve the owner's identity — Google or email+password. Same shape as the
  // wedding-create route so the frontend can share validation messages.
  let ownerEmail;
  let ownerPassword;
  let ownerAuthProvider = 'local';
  let ownerGoogleId;
  let ownerAvatar;

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
    ownerEmail = googleUser.email;
    ownerAuthProvider = 'google';
    ownerGoogleId = googleUser.googleId;
    ownerAvatar = googleUser.picture;
  } else {
    if (!email || typeof email !== 'string' || !validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
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
    ownerEmail = email.toLowerCase().trim();
    ownerPassword = password;
  }

  const trimmedAdminName = adminName.trim();
  const workspaceName = (typeof name === 'string' && name.trim())
    ? name.trim()
    : `${trimmedAdminName}'s Budget`;

  // H-5 (2026-05-28): pre-mint verification token for local-auth signups.
  // Google-auth owners are auto-verified (googleVerify enforces email_verified
  // upstream).
  const verification = ownerAuthProvider === 'local' ? mintEmailVerificationToken() : null;

  // Audit M-5 (2026-05-28): same atomic workspace+owner creation pattern as
  // /api/weddings — three writes wrapped in a single transaction so a failure
  // mid-flow doesn't leave an orphan Personal workspace.
  let workspace, owner;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      [workspace] = await Wedding.create([{
        type: 'personal',
        weddingName: workspaceName,
        totalBudget: Math.max(0, Number(monthlyBudget) || 0),
        currency: currency || '₹',
      }], { session });

      [owner] = await Member.create([{
        weddingId: workspace._id,
        name: trimmedAdminName,
        email: ownerEmail,
        ...(ownerPassword ? { password: ownerPassword } : {}),
        authProvider: ownerAuthProvider,
        ...(ownerGoogleId ? { googleId: ownerGoogleId } : {}),
        ...(ownerAvatar ? { avatar: ownerAvatar } : {}),
        relation: 'Owner',
        role: 'admin',
        ...(ownerAuthProvider === 'google'
          ? { emailVerifiedAt: new Date() }
          : { emailVerificationToken: verification.tokenHash, emailVerificationExpires: verification.expiresAt }),
      }], { session });

      workspace.createdBy = owner._id;
      await workspace.save({ session });
    });
  } finally {
    await session.endSession();
  }

  // C-2: issue the session via HttpOnly cookies. The response drops `token`.
  await issueSession(res, req, owner);

  // H-5: fire-and-forget verification email after the transaction commits.
  if (verification) {
    const verifyUrl = `${frontendBaseUrl()}/verify-email?token=${verification.rawToken}`;
    sendVerificationEmail(ownerEmail, verifyUrl, owner.name).catch((err) => {
      console.error('[personal-create] verification email send failed:', err.message);
    });
  }

  res.status(201).json({
    success: true,
    message: 'Your personal budget is ready!',
    data: {
      wedding: workspace,
      member: owner,
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
  // The name is matched LITERALLY — escaped via the shared utility, never
  // interpolated as a raw regex. A raw regex would allow injection / ReDoS
  // and matching arbitrary members.
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

    // Re-login existing member (C-2: cookie session, no token in body).
    await issueSession(res, req, existingMember);
    return res.status(200).json({
      success: true,
      message: `Welcome back, ${existingMember.name}!`,
      data: {
        wedding,
        member: existingMember
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

  await issueSession(res, req, member);

  res.status(201).json({
    success: true,
    message: `Welcome, ${member.name}! You've joined ${wedding.weddingName}.`,
    data: {
      wedding,
      member
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
  const { weddingName, partner1, partner2, weddingDate, totalBudget, currency, categories, payDay, budgetAllocation } = req.body;

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

  // L0 — Budget allocation (Need/Want/Saving target percentages). Same
  // monthly-budget guard pattern as `payDay`. The Mongoose subdoc validator
  // also enforces sum===100 + integer values, but we pre-validate here so
  // the user gets a clean 400 with a specific message instead of a generic
  // Mongoose ValidationError.
  if (budgetAllocation !== undefined && budgetAllocation !== null) {
    const { getFeatures } = require('../constants/workspaceDefaults');
    if (!getFeatures(wedding.type).monthlyBudget) {
      return res.status(400).json({
        success: false,
        message: 'Budget allocation can only be set on a monthly-budget workspace',
      });
    }
    if (typeof budgetAllocation !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Budget allocation must be an object with need, want, saving percentages',
      });
    }
    const need = Number(budgetAllocation.need);
    const want = Number(budgetAllocation.want);
    const saving = Number(budgetAllocation.saving);
    const allInts = Number.isInteger(need) && Number.isInteger(want) && Number.isInteger(saving);
    const inRange = [need, want, saving].every((n) => n >= 0 && n <= 100);
    if (!allInts || !inRange || (need + want + saving) !== 100) {
      return res.status(400).json({
        success: false,
        message: 'Budget allocation must be integer percentages between 0 and 100 that sum to exactly 100',
      });
    }
    wedding.budgetAllocation = { need, want, saving };
  }

  // Pay day — only meaningful for monthly-budget verticals (Personal). Reject
  // attempts to set it on wedding/trip workspaces so the field can never carry
  // surprising state. `null`/`''` clears the setting; the Mongoose validator
  // catches non-integer / out-of-range values as a 400 via the global handler.
  if (payDay !== undefined) {
    if (payDay === null || payDay === '') {
      wedding.payDay = null;
    } else {
      const { getFeatures } = require('../constants/workspaceDefaults');
      if (!getFeatures(wedding.type).monthlyBudget) {
        return res.status(400).json({
          success: false,
          message: 'Pay day can only be set on a monthly-budget workspace',
        });
      }
      const n = Number(payDay);
      if (!Number.isInteger(n) || n < 1 || n > 31) {
        return res.status(400).json({
          success: false,
          message: 'Pay day must be an integer between 1 and 31',
        });
      }
      wedding.payDay = n;
    }
  }

  await wedding.save();

  recordAudit(req, 'wedding.update', { meta: { fields: Object.keys(req.body || {}) } });

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

  recordAudit(req, 'member.remove', { target: String(member._id), meta: { name: member.name } });

  res.status(200).json({
    success: true,
    message: `${member.name} has been removed`
  });
}));

module.exports = router;
