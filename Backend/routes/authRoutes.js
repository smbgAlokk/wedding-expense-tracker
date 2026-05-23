const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const validator = require('validator');
const Member = require('../models/Member');
const Wedding = require('../models/Wedding');
const { asyncHandler } = require('../middleware/errorHandler');
const { generateToken } = require('../middleware/auth');
const { verifyGoogleCredential } = require('../utils/googleVerify');
const { sendPasswordResetEmail } = require('../utils/email');

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const frontendBaseUrl = () =>
  (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '');

/**
 * POST /api/auth/login
 * Login with email + password (for returning admin/registered users)
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Please provide your email and password'
    });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid email address'
    });
  }

  // Find member with this email (include password for comparison).
  // A user can have accounts in multiple weddings — find all of them.
  // Note: we deliberately do NOT filter by authProvider. A member who created
  // their account locally may later link Google; their password must still work.
  // comparePassword() returns false for members without a password (Google-only),
  // so those are correctly rejected.
  const members = await Member.find({
    email: email.toLowerCase().trim()
  }).select('+password').populate('weddingId');

  if (!members || members.length === 0) {
    return res.status(401).json({
      success: false,
      message: 'Incorrect email or password. Please try again.'
    });
  }

  // Try to match password against any of the member records
  // (password is the same across all weddings for the same email)
  let matchedMember = null;
  for (const m of members) {
    const isMatch = await m.comparePassword(password);
    if (isMatch) {
      matchedMember = m;
      break;
    }
  }

  if (!matchedMember) {
    return res.status(401).json({
      success: false,
      message: 'Incorrect email or password. Please try again.'
    });
  }

  // If member was deactivated (removed from wedding), reactivate them
  if (!matchedMember.isActive) {
    matchedMember.isActive = true;
    await matchedMember.save();
  }

  const wedding = matchedMember.weddingId;
  const token = generateToken(matchedMember._id);

  // Strip password from response
  matchedMember.password = undefined;

  // If user has multiple weddings, return the list for selection
  if (members.length > 1) {
    const activeWeddings = [];
    for (const m of members) {
      const isMatch = await m.comparePassword(password);
      if (isMatch && m.weddingId) {
        if (!m.isActive) {
          m.isActive = true;
          await m.save();
        }
        activeWeddings.push({
          memberId: m._id,
          weddingId: m.weddingId._id,
          weddingName: m.weddingId.weddingName,
          role: m.role,
          joinCode: m.weddingId.joinCode
        });
      }
    }

    if (activeWeddings.length > 1) {
      return res.status(200).json({
        success: true,
        message: 'Multiple weddings found. Please select one.',
        data: {
          multipleWeddings: true,
          weddings: activeWeddings,
          email: matchedMember.email
        }
      });
    }
  }

  res.status(200).json({
    success: true,
    message: `Welcome back, ${matchedMember.name}!`,
    data: {
      wedding,
      member: matchedMember,
      token
    }
  });
}));

/**
 * POST /api/auth/login/select-wedding
 * When user has multiple weddings, select which one to enter
 */
router.post('/login/select-wedding', asyncHandler(async (req, res) => {
  const { memberId } = req.body;

  if (!memberId) {
    return res.status(400).json({
      success: false,
      message: 'Please select a wedding'
    });
  }

  const member = await Member.findById(memberId).populate('weddingId');

  if (!member || !member.weddingId) {
    return res.status(404).json({
      success: false,
      message: 'Wedding not found'
    });
  }

  if (!member.isActive) {
    member.isActive = true;
    await member.save();
  }

  const token = generateToken(member._id);

  res.status(200).json({
    success: true,
    message: `Welcome back, ${member.name}!`,
    data: {
      wedding: member.weddingId,
      member,
      token
    }
  });
}));

/**
 * POST /api/auth/google
 * Google Sign-In (verify Google ID token on backend)
 */
router.post('/google', asyncHandler(async (req, res) => {
  const { credential, joinCode } = req.body;

  // Verify the Google credential against Google's public keys (signature,
  // audience, issuer, expiry). Throws with a statusCode on any failure.
  let googleUser;
  try {
    googleUser = await verifyGoogleCredential(credential);
  } catch (err) {
    return res.status(err.statusCode || 401).json({
      success: false,
      message: err.message
    });
  }

  const { email, name, googleId, picture } = googleUser;

  // Find existing members with this email
  const existingMembers = await Member.find({
    email: email.toLowerCase()
  }).populate('weddingId');

  // Case 1: Existing user — log them in
  if (existingMembers.length > 0) {
    for (const m of existingMembers) {
      let dirty = false;
      // Reactivate if previously removed
      if (!m.isActive) { m.isActive = true; dirty = true; }
      // Link Google ID if not already linked. We intentionally do NOT change
      // authProvider — a local (password) member who signs in with Google keeps
      // both methods, so their password login continues to work.
      if (!m.googleId) { m.googleId = googleId; dirty = true; }
      if (picture && !m.avatar) { m.avatar = picture; dirty = true; }
      if (dirty) await m.save();
    }

    if (existingMembers.length > 1) {
      const activeWeddings = existingMembers.map(m => ({
        memberId: m._id,
        weddingId: m.weddingId._id,
        weddingName: m.weddingId.weddingName,
        role: m.role,
        joinCode: m.weddingId.joinCode
      }));

      return res.status(200).json({
        success: true,
        message: 'Multiple weddings found. Please select one.',
        data: {
          multipleWeddings: true,
          weddings: activeWeddings,
          email
        }
      });
    }

    const member = existingMembers[0];
    const token = generateToken(member._id);

    return res.status(200).json({
      success: true,
      message: `Welcome back, ${member.name}!`,
      data: {
        wedding: member.weddingId,
        member,
        token
      }
    });
  }

  // Case 2: New user with joinCode — join the wedding via Google
  if (joinCode) {
    const wedding = await Wedding.findOne({
      joinCode: joinCode.toUpperCase().trim(),
      isActive: true
    });

    if (!wedding) {
      return res.status(404).json({
        success: false,
        message: 'No wedding found with this code.'
      });
    }

    const member = await Member.create({
      weddingId: wedding._id,
      name: name || email.split('@')[0],
      email: email.toLowerCase(),
      authProvider: 'google',
      googleId,
      avatar: picture || '',
      role: 'member'
    });

    const token = generateToken(member._id);

    return res.status(201).json({
      success: true,
      message: `Welcome, ${member.name}! You've joined ${wedding.weddingName}.`,
      data: {
        wedding,
        member,
        token
      }
    });
  }

  // Case 3: New user without joinCode — no wedding to join
  return res.status(404).json({
    success: false,
    message: 'No account found with this Google email. Please create a wedding first or join one with a code.'
  });
}));

/**
 * POST /api/auth/forgot-password
 * Request a password-reset link. Always responds with the same generic message
 * (whether or not the email exists) to prevent account enumeration.
 */
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;

  // Single response shape for every outcome — no enumeration.
  const generic = () => res.status(200).json({
    success: true,
    message: 'If an account exists for this email, a reset link has been sent.'
  });

  if (!email || typeof email !== 'string' || !validator.isEmail(email)) {
    return generic();
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Only accounts that actually have a password can reset one.
  // (Google-only members sign in with Google — no password to reset.)
  const members = await Member.find({ email: normalizedEmail }).select('+password');
  const resettable = members.filter((m) => m.password);

  if (resettable.length === 0) {
    return generic();
  }

  // One raw token, stored hashed on every account sharing this email so the
  // password stays consistent across a user's multiple weddings.
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

  for (const m of resettable) {
    m.resetPasswordToken = tokenHash;
    m.resetPasswordExpires = expires;
    await m.save({ validateBeforeSave: false });
  }

  const resetUrl = `${frontendBaseUrl()}/reset-password?token=${rawToken}`;
  try {
    await sendPasswordResetEmail(normalizedEmail, resetUrl, resettable[0].name);
  } catch (err) {
    // Never leak whether sending succeeded; the token is already stored.
    console.error('[forgot-password] email send failed:', err.message);
  }

  return generic();
}));

/**
 * POST /api/auth/reset-password
 * Complete a password reset using the token from the email link.
 */
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  if (!token || typeof token !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Invalid request. Please provide a token and a new password.'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters'
    });
  }

  const tokenHash = hashToken(token);
  const member = await Member.findOne({
    resetPasswordToken: tokenHash,
    resetPasswordExpires: { $gt: new Date() }
  }).select('+password');

  if (!member) {
    return res.status(400).json({
      success: false,
      message: 'This reset link is invalid or has expired. Please request a new one.'
    });
  }

  // Apply the new password to every password-holding account with this email
  // (multi-wedding consistency), and clear all reset tokens.
  const sameEmailMembers = await Member.find({ email: member.email }).select('+password');
  for (const m of sameEmailMembers) {
    if (m.password || m._id.equals(member._id)) {
      m.password = password; // pre-save hook hashes it
      m.resetPasswordToken = undefined;
      m.resetPasswordExpires = undefined;
      await m.save();
    }
  }

  return res.status(200).json({
    success: true,
    message: 'Your password has been reset. You can now log in.'
  });
}));

module.exports = router;
