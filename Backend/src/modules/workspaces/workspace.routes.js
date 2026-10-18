const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const validator = require('validator');
const Wedding = require('../../models/Wedding');
const Member = require('../../models/Member');
const { asyncHandler } = require('../../middleware/errorHandler');
const bcrypt = require('bcryptjs');
const { protect, issueSession, loadWorkspace, requireAction, revokeAllForMember } = require('../../middleware/auth');
const {
  PIN_FIELDS,
  usesPin,
  pinProblem,
  hashPin,
  mintResetCode,
  resetCodeMatches,
  attemptWithLockout,
  sendPinError,
} = require('../../services/pinAuth');
const { verifyGoogleCredential } = require('../../integrations/google');
const { verifyTurnstile } = require('../../integrations/turnstile');
const { escapeRegex } = require('../../utils/regex');
const { sendVerificationEmail } = require('../../integrations/email');
const { mintEmailVerificationToken } = require('../../utils/verificationToken');
const { recordAudit } = require('../../services/audit');
const { tenantFilter } = require('../../services/tenantQuery');
const { canAct } = require('../../services/authz');
const { frontendUrl } = require('../../utils/frontendUrl');
const { getFeatures } = require('../../constants/workspaceDefaults');
const { MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_MESSAGE } = require('../../constants/auth');
const { requiresApproval, pendingLimitReached, readmit, publicWedding, notifyJoinRequest } = require('../../services/membership');

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

    if (typeof email !== 'string' || !validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Please create a password'
      });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: PASSWORD_LENGTH_MESSAGE
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
    const verifyUrl = frontendUrl(`/verify-email?token=${verification.rawToken}`);
    sendVerificationEmail(adminEmail, verifyUrl, admin.name).catch((err) => {
      req.log.error({ err: err.message }, 'wedding-create: verification email send failed');
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
    if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: PASSWORD_LENGTH_MESSAGE
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
    const verifyUrl = frontendUrl(`/verify-email?token=${verification.rawToken}`);
    sendVerificationEmail(ownerEmail, verifyUrl, owner.name).catch((err) => {
      req.log.error({ err: err.message }, 'personal-create: verification email send failed');
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

// ─── Join by code (public) ───────────────────────────────────────────────────
// The join code only proves you were invited — it's shared with the whole
// family, so it can never be enough to enter an EXISTING account. Returning
// members prove identity with their PIN; a forgotten PIN needs a reset code
// that only the admin can issue. All three routes sit under the strict
// /api/weddings/join rate-limit bucket, plus the per-account PIN lockout.

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const normalizeName = (s) => s.trim().replace(/\s+/g, ' ');

const JOIN_STATUS_ERRORS = {
  declined: [403, 'REQUEST_DECLINED', 'Your request to join this wedding was declined by the organiser.'],
  banned: [403, 'BANNED', 'This account can no longer join this wedding.'],
  use_login: [409, 'USE_LOGIN', 'An account with this name already exists. Please use Login instead.'],
  reset_required: [409, 'PIN_RESET_REQUIRED', 'Ask the wedding organiser for a reset code to sign back in.'],
};

// Name is matched literally (escaped) and case-insensitively, including removed members.
async function findJoinTarget(joinCode, name) {
  const wedding = await Wedding.findOne({ joinCode: joinCode.toUpperCase().trim(), isActive: true });
  if (!wedding) return {};
  const member = await Member.findOne({
    weddingId: wedding._id,
    name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
  }).select(PIN_FIELDS);
  return { wedding, member };
}

function joinStatus(member) {
  if (!member) return 'new';
  if (member.bannedAt) return member.status === 'rejected' ? 'declined' : 'banned';
  if (!usesPin(member)) return 'use_login';
  return member.pinHash ? 'returning' : 'reset_required';
}

const notFound = (res) => res.status(404).json({
  success: false,
  code: 'WEDDING_NOT_FOUND',
  message: 'No wedding found with this code. Please check and try again.',
});

const WAITING_MESSAGE = "Request sent! You'll get in once the organiser approves.";

// Pending members get a session (so the waiting screen can poll) but only the workspace name.
const sendJoinSession = async (req, res, status, wedding, member, message) => {
  await issueSession(res, req, member);
  const pending = member.status === 'pending';
  res.status(pending ? 202 : status).json({
    success: true,
    message: pending ? WAITING_MESSAGE : message,
    data: { wedding: publicWedding(wedding, member), member },
  });
};

/**
 * POST /api/weddings/join/lookup
 * Step 1: tells the client which form to show for this code + name.
 */
router.post('/join/lookup', asyncHandler(async (req, res) => {
  const { joinCode, name } = req.body;
  if (!isText(joinCode) || !isText(name)) {
    return res.status(400).json({ success: false, message: 'Please provide the wedding code and your name' });
  }
  const { wedding, member } = await findJoinTarget(joinCode, normalizeName(name));
  if (!wedding) return notFound(res);

  const status = joinStatus(member);
  if (status === 'banned' || status === 'declined') {
    const [code, errCode, message] = JOIN_STATUS_ERRORS[status];
    return res.status(code).json({ success: false, code: errCode, message });
  }
  res.status(200).json({
    success: true,
    data: { status, weddingName: wedding.weddingName, requiresApproval: status === 'new' && requiresApproval(wedding) },
  });
}));

/**
 * POST /api/weddings/join
 * New member → creates the account with their PIN. Returning member → PIN sign-in.
 */
router.post('/join', asyncHandler(async (req, res) => {
  const { joinCode, name, relation, pin } = req.body;
  if (!isText(joinCode) || !isText(name)) {
    return res.status(400).json({ success: false, message: 'Please provide the wedding code and your name' });
  }
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) return sendPinError(res, 'PIN_FORMAT');

  const displayName = normalizeName(name);
  const { wedding, member } = await findJoinTarget(joinCode, displayName);
  if (!wedding) return notFound(res);

  const status = joinStatus(member);
  if (JOIN_STATUS_ERRORS[status]) {
    const [code, errCode, message] = JOIN_STATUS_ERRORS[status];
    return res.status(code).json({ success: false, code: errCode, message });
  }

  if (status === 'returning') {
    const result = await attemptWithLockout(member, () => bcrypt.compare(pin, member.pinHash));
    if (result !== 'ok') return sendPinError(res, result);
    await readmit(member, wedding);
    return sendJoinSession(req, res, 200, wedding, member, `Welcome back, ${member.name}!`);
  }

  const problem = pinProblem(pin);
  if (problem) return sendPinError(res, problem);

  const pending = requiresApproval(wedding);
  if (pending && await pendingLimitReached(wedding._id)) {
    return res.status(429).json({
      success: false,
      code: 'TOO_MANY_REQUESTS',
      message: 'This wedding has too many pending join requests. Please try again later.',
    });
  }

  const created = await Member.create({
    weddingId: wedding._id,
    name: displayName,
    relation: isText(relation) ? relation.trim().slice(0, 50) : 'Family',
    role: 'member',
    status: pending ? 'pending' : 'approved',
    pinHash: await hashPin(pin),
    pinSetAt: new Date(),
  });
  if (pending) notifyJoinRequest(wedding, created);
  return sendJoinSession(req, res, 201, wedding, created, `Welcome, ${created.name}! You've joined ${wedding.weddingName}.`);
}));

/**
 * POST /api/weddings/join/reset-pin
 * Redeems the admin-issued reset code and sets a new PIN. Every failure mode
 * returns the same message so the code can't be probed; guesses count toward
 * the PIN lockout. All existing sessions for the account are revoked.
 */
router.post('/join/reset-pin', asyncHandler(async (req, res) => {
  const { joinCode, name, resetCode, pin } = req.body;
  const invalid = () => res.status(400).json({
    success: false,
    code: 'RESET_CODE_INVALID',
    message: 'This reset code is invalid or has expired. Ask the organiser for a new one.',
  });
  if (!isText(joinCode) || !isText(name) || !isText(resetCode)) return invalid();
  const problem = pinProblem(pin);
  if (problem) return sendPinError(res, problem);

  const { wedding, member } = await findJoinTarget(joinCode, normalizeName(name));
  if (!wedding || !member || member.bannedAt || !usesPin(member)) return invalid();

  const result = await attemptWithLockout(member, async () => resetCodeMatches(member, resetCode));
  if (result === 'locked') return sendPinError(res, 'locked');
  if (result === 'wrong') return invalid();

  member.pinHash = await hashPin(pin);
  member.pinSetAt = new Date();
  member.pinResetCodeHash = undefined;
  member.pinResetExpires = undefined;
  await member.save();
  await readmit(member, wedding);
  await revokeAllForMember(member._id);

  return sendJoinSession(req, res, 200, wedding, member, `Welcome back, ${member.name}!`);
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
    isActive: true,
    status: { $ne: 'pending' }
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
router.put('/current', protect, loadWorkspace, requireAction('wedding.update'), asyncHandler(async (req, res) => {
  const { weddingName, partner1, partner2, weddingDate, totalBudget, currency, categories, payDay, budgetAllocation, joinApproval } = req.body;

  // A-1/A-2 (§14.H): authorization via requireAction(canAct); the workspace was
  // already fetched by loadWorkspace, so no per-route refetch (helps M-13).
  const wedding = req.workspace;

  const badType = [weddingName, partner1, partner2, currency].some((v) => v !== undefined && typeof v !== 'string')
    || (categories !== undefined && !Array.isArray(categories));
  if (badType) {
    return res.status(400).json({ success: false, message: 'Invalid data format' });
  }

  if (weddingName?.trim()) wedding.weddingName = weddingName.trim();
  if (partner1?.trim()) wedding.coupleNames.partner1 = partner1.trim();
  if (partner2?.trim()) wedding.coupleNames.partner2 = partner2.trim();
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

  if (joinApproval !== undefined) {
    if (typeof joinApproval !== 'boolean' || !getFeatures(wedding.type).joinCode) {
      return res.status(400).json({ success: false, message: 'Join approval must be true or false on a workspace with a join code' });
    }
    wedding.joinApproval = joinApproval;
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
  // Data minimisation: everyone sees what the UI shows; contact/account details
  // (email, PIN status) and join requests are admin-only.
  const isAdmin = canAct(req.member, null, 'member.approve');
  const fields = `name relation role avatar createdAt${isAdmin ? ' email pinSetAt status updatedAt' : ''}`;
  const [members, pending] = await Promise.all([
    Member.find(tenantFilter(req.weddingId, { isActive: true, status: { $ne: 'pending' } }))
      .select(fields).sort({ role: 1, createdAt: 1 }).lean(),
    isAdmin
      ? Member.find(tenantFilter(req.weddingId, { isActive: true, status: 'pending' })).select(fields).sort({ updatedAt: 1 }).lean()
      : [],
  ]);

  res.status(200).json({
    success: true,
    data: { members, pending }
  });
}));

/**
 * POST /api/weddings/current/members/:memberId/approve | reject (admin)
 * Decides a pending join request. Atomic on `status: 'pending'`, so a double
 * click or two admins can't both act. Declining sets bannedAt — every entry
 * path already refuses banned members — and kills any session they hold.
 */
router.post('/current/members/:memberId/:decision(approve|reject)', protect, requireAction('member.approve'), asyncHandler(async (req, res) => {
  const approve = req.params.decision === 'approve';
  const member = await Member.findOneAndUpdate(
    tenantFilter(req.weddingId, { _id: req.params.memberId, status: 'pending' }),
    approve
      ? { $set: { status: 'approved' } }
      : { $set: { status: 'rejected', isActive: false, bannedAt: new Date() } },
    { new: true }
  );
  if (!member) {
    return res.status(404).json({ success: false, message: 'This request is no longer pending.' });
  }
  if (!approve) await revokeAllForMember(member._id);
  recordAudit(req, approve ? 'member.approve' : 'member.reject', { target: String(member._id), meta: { name: member.name } });

  res.status(200).json({
    success: true,
    message: approve ? `${member.name} can now join` : `${member.name}'s request was declined`,
    data: { member },
  });
}));

/**
 * DELETE /api/weddings/current/members/:memberId
 * Remove a member (admin only)
 */
router.delete('/current/members/:memberId', protect, requireAction('member.remove'), asyncHandler(async (req, res) => {
  const member = await Member.findOne(tenantFilter(req.weddingId, { _id: req.params.memberId }));

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

  // A-3 (§14.H): `{ ban: true }` permanently bans (blocks all future re-entry),
  // versus the default soft-delete the member could undo by re-joining.
  const ban = req.body && (req.body.ban === true || req.body.ban === 'true');
  member.isActive = false;
  if (ban) member.bannedAt = new Date();
  await member.save();

  recordAudit(req, ban ? 'member.ban' : 'member.remove', { target: String(member._id), meta: { name: member.name, banned: ban } });

  res.status(200).json({
    success: true,
    message: ban ? `${member.name} has been removed and banned` : `${member.name} has been removed`
  });
}));

/**
 * POST /api/weddings/current/members/:memberId/pin-reset (admin)
 * Issues a single-use reset code for a join-code member. Clears the old PIN
 * (so a leaked one stops working) and signs the member out everywhere. The raw
 * code is returned exactly once — only its hash is stored.
 */
router.post('/current/members/:memberId/pin-reset', protect, requireAction('member.resetPin'), asyncHandler(async (req, res) => {
  const member = await Member.findOne(tenantFilter(req.weddingId, { _id: req.params.memberId })).select('+password');
  if (!member || member.bannedAt) {
    return res.status(404).json({ success: false, message: 'Member not found' });
  }
  if (!usesPin(member)) {
    return res.status(400).json({ success: false, message: 'This member signs in with email, not a PIN.' });
  }

  const { code, codeHash, expiresAt } = mintResetCode();
  await Member.updateOne(
    { _id: member._id },
    {
      $set: { pinResetCodeHash: codeHash, pinResetExpires: expiresAt, pinSetAt: null, loginAttempts: 0 },
      $unset: { pinHash: 1, lockedUntil: 1 },
    }
  );
  await revokeAllForMember(member._id);
  recordAudit(req, 'member.pin_reset', { target: String(member._id), meta: { name: member.name } });

  res.set('Cache-Control', 'no-store');
  res.status(200).json({ success: true, data: { code, expiresAt } });
}));

module.exports = router;
