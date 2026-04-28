const express = require('express');
const router = express.Router();
const validator = require('validator');
const Member = require('../models/Member');
const Wedding = require('../models/Wedding');
const { asyncHandler } = require('../middleware/errorHandler');
const { generateToken } = require('../middleware/auth');

/**
 * POST /api/auth/login
 * Login with email + password (for returning admin/registered users)
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
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

  // Find member with this email (include password for comparison)
  // A user can have accounts in multiple weddings — find all active ones
  const members = await Member.find({
    email: email.toLowerCase().trim(),
    authProvider: 'local'
  }).select('+password').populate('weddingId');

  if (!members || members.length === 0) {
    return res.status(401).json({
      success: false,
      message: 'No account found with this email. Please check and try again.'
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
      message: 'Incorrect password. Please try again.'
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

  if (!credential) {
    return res.status(400).json({
      success: false,
      message: 'Google credential is required'
    });
  }

  // Decode the Google JWT credential (header.payload.signature)
  // In production, verify with Google's public keys. For now, decode payload.
  let payload;
  try {
    const base64Url = credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    payload = JSON.parse(Buffer.from(base64, 'base64').toString());
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid Google credential'
    });
  }

  const { email, name, sub: googleId, picture } = payload;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Could not get email from Google account'
    });
  }

  // Find existing members with this email
  const existingMembers = await Member.find({
    email: email.toLowerCase()
  }).populate('weddingId');

  // Case 1: Existing user — log them in
  if (existingMembers.length > 0) {
    // Reactivate if needed
    for (const m of existingMembers) {
      if (!m.isActive) {
        m.isActive = true;
        await m.save();
      }
      // Link Google ID if not already linked
      if (!m.googleId) {
        m.googleId = googleId;
        m.authProvider = 'google';
        if (picture && !m.avatar) m.avatar = picture;
        await m.save();
      }
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

module.exports = router;
