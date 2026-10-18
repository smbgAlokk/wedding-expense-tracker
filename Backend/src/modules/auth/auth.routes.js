const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const Member = require('../../models/Member');
const Wedding = require('../../models/Wedding');
const { asyncHandler } = require('../../middleware/errorHandler');
const {
  protect,
  protectAllowPending,
  issueSession,
  generateAccessToken,
  generateSelectorToken,
  verifySelectorToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForMember,
  setSessionCookies,
  clearSessionCookies,
  REFRESH_COOKIE,
} = require('../../middleware/auth');
const { verifyGoogleCredential } = require('../../integrations/google');
const { verifyTurnstile } = require('../../integrations/turnstile');
const { recordAudit } = require('../../services/audit');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../../integrations/email');
const {
  mintEmailVerificationToken,
  hashToken: hashVerificationToken,
  EMAIL_VERIFICATION_EXPIRY_MS,
} = require('../../utils/verificationToken');
const { frontendUrl } = require('../../utils/frontendUrl');
const { MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_MESSAGE } = require('../../constants/auth');
const { usesPin, pinProblem, hashPin, attemptWithLockout, sendPinError } = require('../../services/pinAuth');
const { requiresApproval, pendingLimitReached, readmit, publicWedding, notifyJoinRequest } = require('../../services/membership');

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const RESEND_COOLDOWN_MS = 60 * 1000; // keep in sync with VERIFY_RESEND_COOLDOWN_S on the client
const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// ─── Brute-force lockout (Security audit H-2, 2026-05-28) ──────────────────
//
// Per-account lockout: 10 consecutive failed sign-ins on any Member doc
// sharing the submitted email triggers a 15-minute cool-down. Counter resets
// on success. Counters live on the Member doc itself (loginAttempts +
// lockedUntil, both select:false) so the hot protect-middleware projection
// stays untouched — only /login pays the cost of pulling them in.
//
// Anti-enumeration: when the email yields zero Member docs, we still run a
// real bcrypt.compare against ANTI_ENUM_HASH so unknown-email and
// wrong-password paths take similar wall-clock time. Closes the L-7 timing
// oracle for free (no separate audit row needed).
//
// The lockout response is 429 with a deliberately vague message. The 10th
// failure itself still returns 401 (matching the previous 9 responses) — the
// 429 only fires on attempt 11+ while the lock is hot. This keeps the
// off-by-one threshold opaque: attackers can't probe for the exact failure
// count that triggers the switch.
const MAX_LOGIN_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const ANTI_ENUM_HASH = bcrypt.hashSync('do-not-match-anyone-anti-enum', 12);

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

  // H-8: CAPTCHA gate. No-op unless TURNSTILE_SECRET is configured (verifyTurnstile
  // returns success when disabled), so dev / un-keyed deploys are unaffected. Runs
  // BEFORE the member lookup so a bot can't even reach the bcrypt path.
  const captcha = await verifyTurnstile(req.body.turnstileToken, req.ip);
  if (!captcha.success) {
    return res.status(400).json({
      success: false,
      message: 'Captcha verification failed. Please try again.'
    });
  }

  // Find member with this email (include password + lockout counters for the
  // brute-force check below). A user can have accounts in multiple weddings —
  // find all of them. We deliberately do NOT filter by authProvider: a member
  // who created their account locally may later link Google; their password
  // must still work. comparePassword() returns false for members without a
  // password (Google-only), so those are correctly rejected.
  const members = await Member.find({
    email: email.toLowerCase().trim()
  }).select('+password +loginAttempts +lockedUntil').populate('weddingId');

  // Anti-enumeration: when no member exists for this email, still burn a
  // real bcrypt.compare so the unknown-email path takes ~the same wall-clock
  // time as a wrong-password path. Without this, an attacker can probe which
  // emails have accounts by measuring response latency.
  if (!members || members.length === 0) {
    await bcrypt.compare(password, ANTI_ENUM_HASH);
    return res.status(401).json({
      success: false,
      message: 'Incorrect email or password. Please try again.'
    });
  }

  // Lockout check — runs BEFORE any comparePassword so a hot lock costs zero
  // bcrypt CPU. If ANY Member doc sharing this email is locked, the email is
  // locked as a unit (they all share one password; cracking any one is
  // equivalent to cracking the rest). Generic 429 with no countdown — we do
  // not leak whether the lock is hot vs the password just happened to be
  // wrong, and we do not reveal the exact threshold.
  const now = new Date();
  const isLocked = members.some((m) => m.lockedUntil && m.lockedUntil > now);
  if (isLocked) {
    return res.status(429).json({
      success: false,
      message: 'Too many failed sign-in attempts. Please try again later.'
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
    // Increment the failure counter on EVERY member doc sharing this email.
    // Each one that reaches MAX_LOGIN_ATTEMPTS gets stamped with a fresh
    // lockedUntil and its counter reset to 0 — so the next 10 failures past
    // the unlock window earn the next lockout cleanly.
    //
    // Returning 401 (not 429) on the exact attempt that triggers the lock
    // keeps the threshold opaque: the response shape is identical for
    // attempts 1..MAX, and only attempt MAX+1 (and later, while the lock is
    // hot) flips to 429. validateBeforeSave:false skips unrelated validators
    // so a doc with a legacy quirk doesn't block the counter update.
    for (const m of members) {
      m.loginAttempts = (m.loginAttempts || 0) + 1;
      if (m.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        m.lockedUntil = new Date(Date.now() + LOCKOUT_WINDOW_MS);
        m.loginAttempts = 0;
      }
      await m.save({ validateBeforeSave: false });
    }
    return res.status(401).json({
      success: false,
      message: 'Incorrect email or password. Please try again.'
    });
  }

  // Success path: reset lockout state on every member sharing this email.
  // They locked as a unit; they unlock as a unit. Skipped if already clean
  // to avoid pointless writes on the steady-state happy path.
  for (const m of members) {
    if ((m.loginAttempts && m.loginAttempts > 0) || m.lockedUntil) {
      m.loginAttempts = 0;
      m.lockedUntil = undefined;
      await m.save({ validateBeforeSave: false });
    }
  }

  // Every membership this password opens, minus banned / declined ones (A-3).
  // matchedMember is already verified — don't pay for a second bcrypt compare.
  const enterable = [];
  for (const m of members) {
    if (m.weddingId && !m.bannedAt && (m === matchedMember || await m.comparePassword(password))) enterable.push(m);
  }
  if (!enterable.length) {
    return res.status(403).json({ success: false, message: 'This account can no longer access this wedding.' });
  }
  // Removed members come back (through approval when the workspace requires it).
  for (const m of enterable) await readmit(m);

  const sessionMember = enterable[0];
  const wedding = sessionMember.weddingId;
  sessionMember.password = undefined;

  if (enterable.length > 1) {
    // Security audit C-1 + H-1: a short-lived purpose-bound selector token
    // proves this password check happened; join codes are never returned.
    const weddings = enterable.map((m) => ({
      memberId: m._id,
      weddingId: m.weddingId._id,
      weddingName: m.weddingId.weddingName,
      role: m.role,
    }));
    return res.status(200).json({
      success: true,
      message: 'Multiple weddings found. Please select one.',
      data: {
        multipleWeddings: true,
        weddings,
        email: matchedMember.email,
        selectorToken: generateSelectorToken(matchedMember.email, weddings.map((w) => w.memberId)),
      }
    });
  }

  // C-2: session via HttpOnly cookies — no token in the body.
  await issueSession(res, req, sessionMember);

  res.status(200).json({
    success: true,
    message: `Welcome back, ${sessionMember.name}!`,
    data: {
      wedding: publicWedding(wedding, sessionMember),
      member: sessionMember
    }
  });
}));

/**
 * POST /api/auth/login/select-wedding
 *
 * Security audit C-1 (2026-05-28): this endpoint used to accept a bare
 * `memberId` from the request body and mint a session token for it, with no
 * proof that the caller had actually authenticated. Any member who could
 * discover another member's `_id` (e.g., via the protected
 * `GET /current/members` endpoint after joining a workspace) could trade it
 * for a JWT and impersonate them — including the admin. Single-request
 * workspace takeover. Severity: critical.
 *
 * The fix wires this endpoint to a short-lived selector token minted by
 * `/login` or `/google` whenever those endpoints resolve to multiple weddings.
 * The selector token (a) proves the caller passed password/Google verification
 * in the last 5 minutes, (b) embeds an allowlist of memberIds the caller is
 * permitted to select. Without the token, the endpoint returns 401; with a
 * valid token, the requested memberId is checked against the allowlist before
 * any session is issued.
 */
router.post('/login/select-wedding', asyncHandler(async (req, res) => {
  const { memberId, selectorToken } = req.body;

  if (!memberId || typeof memberId !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Please select a wedding'
    });
  }

  // Verify the selector token. verifySelectorToken throws with a tagged
  // statusCode on missing/expired/tampered tokens — uniform 401 response
  // regardless of which failure mode triggered (no information leak).
  let payload;
  try {
    payload = verifySelectorToken(selectorToken);
  } catch (err) {
    return res.status(err.statusCode || 401).json({
      success: false,
      message: err.message || 'Your sign-in session expired. Please sign in again.'
    });
  }

  // Confirm the requested memberId is one this selector token authorised.
  // Without this, a stolen selector token would still be limited to its
  // original member set — but a single compromised payload could otherwise
  // be replayed against any memberId until the 5-min window closed.
  if (!payload.members.includes(String(memberId))) {
    return res.status(403).json({
      success: false,
      message: 'Invalid wedding selection.'
    });
  }

  const member = await Member.findById(memberId).populate('weddingId');

  if (!member || !member.weddingId) {
    return res.status(404).json({
      success: false,
      message: 'Wedding not found'
    });
  }

  // Defence in depth: the selector token's `sub` (email) must match the
  // member's email. If a member's email was changed between login and
  // select-wedding (admin action, etc.), the original selector becomes void.
  if (member.email && payload.sub && member.email.toLowerCase() !== String(payload.sub).toLowerCase()) {
    return res.status(403).json({
      success: false,
      message: 'Invalid wedding selection.'
    });
  }

  // A-3 (§14.H): a banned membership can't be entered via the selector either.
  if (member.bannedAt) {
    return res.status(403).json({ success: false, message: 'This account can no longer access this wedding.' });
  }

  await readmit(member);

  await issueSession(res, req, member);

  res.status(200).json({
    success: true,
    message: `Welcome back, ${member.name}!`,
    data: {
      wedding: publicWedding(member.weddingId, member),
      member
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

  // Joining by code targets ONE wedding: resolve it first so an existing user
  // lands in that membership (or gets a new one) — never silently in another.
  let wedding = null;
  if (joinCode) {
    if (typeof joinCode !== 'string') {
      return res.status(400).json({ success: false, message: 'No wedding found with this code.' });
    }
    wedding = await Wedding.findOne({ joinCode: joinCode.toUpperCase().trim(), isActive: true });
    if (!wedding) {
      return res.status(404).json({ success: false, message: 'No wedding found with this code.' });
    }
  }

  const allMemberships = await Member.find({ email: email.toLowerCase() }).populate('weddingId');
  // Banned / declined memberships can't be entered, so never offer them.
  const existingMembers = allMemberships.filter((m) =>
    m.weddingId && !m.bannedAt && (!wedding || m.weddingId._id.equals(wedding._id)));
  const blockedHere = wedding && allMemberships.some((m) => m.bannedAt && m.weddingId?._id.equals(wedding._id));
  if (blockedHere || (!wedding && allMemberships.length && !existingMembers.length)) {
    return res.status(403).json({ success: false, message: 'This account can no longer access this wedding.' });
  }

  // Case 1: Existing user — log them in
  if (existingMembers.length > 0) {
    for (const m of existingMembers) {
      await readmit(m); // removed members return through approval when required
      let dirty = false;
      // Link Google ID if not already linked. We intentionally do NOT change
      // authProvider — a local (password) member who signs in with Google keeps
      // both methods, so their password login continues to work.
      if (!m.googleId) { m.googleId = googleId; dirty = true; }
      if (picture && !m.avatar) { m.avatar = picture; dirty = true; }
      // H-5 (2026-05-28): Google's verifyIdToken already enforces
      // email_verified=true (see integrations/google.js), so any successful
      // Google sign-in is by definition proof of email control. Stamp the
      // verified-at field on first Google login if the member predated H-5
      // or signed up via password and never clicked the verification link.
      if (!m.emailVerifiedAt) { m.emailVerifiedAt = new Date(); dirty = true; }
      if (dirty) await m.save();
    }

    if (existingMembers.length > 1) {
      // Security audit C-1 + H-1 (2026-05-28): same protections as /login —
      // joinCode is NOT shipped to the client; a selector token gates the
      // subsequent /select-wedding call.
      const activeWeddings = existingMembers.map(m => ({
        memberId: m._id,
        weddingId: m.weddingId._id,
        weddingName: m.weddingId.weddingName,
        role: m.role,
      }));

      const selectorToken = generateSelectorToken(
        email,
        activeWeddings.map((w) => w.memberId)
      );

      return res.status(200).json({
        success: true,
        message: 'Multiple weddings found. Please select one.',
        data: {
          multipleWeddings: true,
          weddings: activeWeddings,
          email,
          selectorToken,
        }
      });
    }

    const member = existingMembers[0];
    if (member.bannedAt) {
      return res.status(403).json({ success: false, message: 'This account can no longer access this wedding.' });
    }
    await issueSession(res, req, member);

    return res.status(200).json({
      success: true,
      message: `Welcome back, ${member.name}!`,
      data: {
        wedding: publicWedding(member.weddingId, member),
        member
      }
    });
  }

  // Case 2: Not yet a member of the coded wedding — join it via Google
  if (wedding) {
    // A leaked code + any Google account must not bypass join approval.
    const pending = requiresApproval(wedding);
    if (pending && await pendingLimitReached(wedding._id)) {
      return res.status(429).json({
        success: false,
        code: 'TOO_MANY_REQUESTS',
        message: 'This wedding has too many pending join requests. Please try again later.',
      });
    }

    const member = await Member.create({
      weddingId: wedding._id,
      name: name || email.split('@')[0],
      email: email.toLowerCase(),
      authProvider: 'google',
      googleId,
      avatar: picture || '',
      role: 'member',
      status: pending ? 'pending' : 'approved',
      // H-5 (2026-05-28): Google's verifyIdToken enforces email_verified=true
      // upstream, so a member created from a Google sign-in already proved
      // email control. Skip the verification email entirely for this path.
      emailVerifiedAt: new Date(),
    });
    if (pending) notifyJoinRequest(wedding, member);

    await issueSession(res, req, member);

    return res.status(pending ? 202 : 201).json({
      success: true,
      message: pending
        ? `Request sent! You'll get in once the organiser approves.`
        : `Welcome, ${member.name}! You've joined ${wedding.weddingName}.`,
      data: {
        wedding: publicWedding(wedding, member),
        member
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

  // H-8: CAPTCHA gate (no-op unless configured). Returning 400 on captcha
  // failure is enumeration-safe — it's independent of whether the email exists.
  const captcha = await verifyTurnstile(req.body.turnstileToken, req.ip);
  if (!captcha.success) {
    return res.status(400).json({
      success: false,
      message: 'Captcha verification failed. Please try again.'
    });
  }

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

  const resetUrl = frontendUrl(`/reset-password?token=${rawToken}`);
  try {
    await sendPasswordResetEmail(normalizedEmail, resetUrl, resettable[0].name);
  } catch (err) {
    // Never leak whether sending succeeded; the token is already stored.
    req.log.error({ err: err.message }, 'forgot-password: email send failed');
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

  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      success: false,
      message: PASSWORD_LENGTH_MESSAGE
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

  // H-5 gate (2026-05-28): refuse to complete a password reset when the
  // member's email isn't verified. Closes the squat-then-recover attack:
  // attacker registers victim@x.com, never verifies; victim signs up later,
  // can't reset until they prove email control via the verification flow
  // (which is itself a separate email-click). The verify-email link arrives
  // at the same address as this reset link, so a legitimate owner who
  // controls the inbox can complete both flows easily. Returns 403 (not 400)
  // to distinguish from "bad token" — the client can render a specific CTA
  // pointing the user at /resend-verification.
  if (!member.emailVerifiedAt) {
    return res.status(403).json({
      success: false,
      message: 'Please verify your email before resetting your password. We can resend the verification link.',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }

  // Apply the new password to every password-holding account with this email
  // (multi-wedding consistency), and clear all reset tokens. H-5 defence in
  // depth: also stamp emailVerifiedAt on every same-email member — clicking
  // through a reset link is itself proof of email control, so any member
  // doc that somehow ended up unverified gets cleaned up here.
  const sameEmailMembers = await Member.find({ email: member.email }).select('+password');
  const now = new Date();
  const changed = sameEmailMembers.filter((m) => m.password || m._id.equals(member._id));
  for (const m of changed) {
    m.password = password; // pre-save hook hashes it
    m.resetPasswordToken = undefined;
    m.resetPasswordExpires = undefined;
    m.loginAttempts = 0;
    m.lockedUntil = undefined;
    if (!m.emailVerifiedAt) m.emailVerifiedAt = now;
    await m.save();
  }
  // A reset usually means the account may be compromised: end every existing session.
  await Promise.all(changed.map((m) => revokeAllForMember(m._id)));

  return res.status(200).json({
    success: true,
    message: 'Your password has been reset. You can now log in.'
  });
}));

/**
 * POST /api/auth/verify-email
 * Complete an email-verification flow using the token from the email link.
 * Marks every Member doc sharing this email as verified (multi-wedding
 * consistency — one human, multiple workspaces, all unlocked together).
 * Generic-message responses match the rest of the auth surface; we don't
 * leak whether the token was malformed vs expired vs unknown.
 *
 * Idempotent: the token hash is kept until it expires, so re-opening the link
 * (second click, email-client prefetch, page reload) answers 200 with
 * `alreadyVerified: true` instead of a misleading "invalid link". A replayed
 * token can only re-confirm an already-verified address.
 */
router.post('/verify-email', asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'This verification link is invalid or has expired. Please request a new one.'
    });
  }

  const tokenHash = hashVerificationToken(token);
  const member = await Member.findOne({
    emailVerificationToken: tokenHash,
    emailVerificationExpires: { $gt: new Date() }
  }).select('email').lean();

  if (!member || !member.email) {
    return res.status(400).json({
      success: false,
      message: 'This verification link is invalid or has expired. Please request a new one.'
    });
  }

  // `emailVerifiedAt: null` also matches legacy docs where the field is absent.
  const { modifiedCount } = await Member.updateMany(
    { email: member.email, emailVerifiedAt: null },
    { $set: { emailVerifiedAt: new Date() } }
  );

  return res.status(200).json({
    success: true,
    alreadyVerified: modifiedCount === 0,
    message: 'Your email is verified. You can now use all features.'
  });
}));

/**
 * POST /api/auth/resend-verification
 * Re-send the verification link. Anti-enumeration generic response: the
 * caller cannot distinguish "no such email" from "email already verified"
 * from "fresh link sent." Two layers stop it being used to mail-bomb an inbox:
 * the per-IP auth bucket (30 / 15 min) and a per-address cooldown.
 */
router.post('/resend-verification', asyncHandler(async (req, res) => {
  const { email } = req.body;

  const generic = () => res.status(200).json({
    success: true,
    message: 'If an account exists for this email and is not yet verified, a verification link has been sent.'
  });

  if (!email || typeof email !== 'string' || !validator.isEmail(email)) {
    return generic();
  }

  const normalizedEmail = email.toLowerCase().trim();

  // One raw token, stored hashed on every unverified same-email member so a
  // single click verifies every workspace. The expiry filter makes the
  // cooldown atomic: only docs whose last link is older than the cooldown
  // match, so concurrent requests can't both mint and send.
  const { rawToken, tokenHash, expiresAt } = mintEmailVerificationToken();
  const cooldownCutoff = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS - RESEND_COOLDOWN_MS);
  const { modifiedCount } = await Member.updateMany(
    {
      email: normalizedEmail,
      emailVerifiedAt: null,
      $or: [{ emailVerificationExpires: null }, { emailVerificationExpires: { $lte: cooldownCutoff } }],
    },
    { $set: { emailVerificationToken: tokenHash, emailVerificationExpires: expiresAt } }
  );
  if (modifiedCount === 0) return generic();

  const recipient = await Member.findOne({ email: normalizedEmail, emailVerificationToken: tokenHash })
    .select('name').lean();
  const verifyUrl = frontendUrl(`/verify-email?token=${rawToken}`);
  try {
    await sendVerificationEmail(normalizedEmail, verifyUrl, recipient?.name);
  } catch (err) {
    // Token is already stored; never leak whether sending succeeded.
    req.log.error({ err: err.message }, 'resend-verification: email send failed');
  }

  return generic();
}));

// ─── Session lifecycle (Security audit C-2 full migration, §14.F) ────────────

/**
 * POST /api/auth/refresh
 * Rotate the refresh token and mint a fresh access token. Called by the
 * frontend's 401 interceptor when the 15-min access token expires. The refresh
 * token is read from the HttpOnly cookie, consumed (single-use), and replaced
 * with a new one in the same family. CSRF-protected (double-submit).
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const presented = req.cookies && req.cookies[REFRESH_COOKIE];

  let rotated;
  try {
    rotated = await rotateRefreshToken(presented, req);
  } catch (err) {
    clearSessionCookies(res);
    return res.status(err.statusCode || 401).json({
      success: false,
      message: err.message || 'Your session has expired. Please sign in again.'
    });
  }

  const member = await Member.findById(rotated.memberId)
    .select('name role isActive weddingId')
    .lean();

  if (!member || !member.isActive) {
    // Member deleted or deactivated since the refresh token was issued.
    await revokeRefreshToken(rotated.rawToken);
    clearSessionCookies(res);
    return res.status(401).json({
      success: false,
      message: 'Your session is no longer valid. Please sign in again.'
    });
  }

  // Re-issue cookies: fresh access token + the ROTATED refresh token (already
  // persisted by rotateRefreshToken) + a fresh csrf token. We do NOT call
  // issueSession here — that would mint a second, unrelated refresh family.
  const accessToken = generateAccessToken(member._id);
  const csrf = crypto.randomBytes(24).toString('hex');
  setSessionCookies(res, { accessToken, refreshToken: rotated.rawToken, csrf });

  return res.status(200).json({
    success: true,
    data: { member }
  });
}));

/**
 * POST /api/auth/logout
 * Revoke the current refresh token and clear all session cookies. CSRF-protected.
 */
router.post('/logout', asyncHandler(async (req, res) => {
  const presented = req.cookies && req.cookies[REFRESH_COOKIE];
  await revokeRefreshToken(presented);
  clearSessionCookies(res);
  return res.status(200).json({ success: true, message: 'Signed out.' });
}));

/**
 * POST /api/auth/logout-all
 * Logout-everywhere: revoke every active refresh token for the authenticated
 * member (all devices/sessions), then clear this device's cookies.
 */
router.post('/logout-all', protect, asyncHandler(async (req, res) => {
  await revokeAllForMember(req.member._id);
  recordAudit(req, 'auth.logout_all', {});
  clearSessionCookies(res);
  return res.status(200).json({ success: true, message: 'Signed out of all devices.' });
}));

/**
 * PUT /api/auth/pin
 * Set or change the signed-in join-code member's PIN. Changing requires the
 * current PIN (under the same lockout as sign-in); members without one yet
 * (joined before PINs existed) set it directly. Every other session is
 * revoked and this device gets a fresh one.
 */
router.put('/pin', protect, asyncHandler(async (req, res) => {
  const { currentPin, newPin } = req.body;
  const problem = pinProblem(newPin);
  if (problem) return sendPinError(res, problem);

  const member = await Member.findById(req.member._id).select('+password +pinHash +loginAttempts +lockedUntil');
  if (!member || !usesPin(member)) {
    return res.status(400).json({ success: false, message: 'Your account signs in with email, not a PIN.' });
  }

  if (member.pinHash) {
    const result = await attemptWithLockout(member, async () =>
      typeof currentPin === 'string' && bcrypt.compare(currentPin, member.pinHash));
    if (result !== 'ok') return sendPinError(res, result);
  }

  member.pinHash = await hashPin(newPin);
  member.pinSetAt = new Date();
  await member.save();
  await revokeAllForMember(member._id);
  await issueSession(res, req, member);
  recordAudit(req, 'member.pin_change', { target: String(member._id) });

  return res.status(200).json({ success: true, message: 'Your PIN has been saved.', data: { member } });
}));

/**
 * GET /api/auth/me
 * Session probe + bootstrap. Returns the current member + wedding if the access
 * token is valid; 401 otherwise (the frontend's interceptor then tries /refresh).
 * Safe method → CSRF-exempt.
 */
router.get('/me', protectAllowPending, asyncHandler(async (req, res) => {
  const [member, wedding] = await Promise.all([
    Member.findById(req.member._id), // toJSON strips sensitive fields
    Wedding.findById(req.weddingId),
  ]);
  if (!member) {
    return res.status(401).json({ success: false, message: 'Session not found. Please sign in again.' });
  }
  return res.status(200).json({ success: true, data: { member, wedding: wedding && publicWedding(wedding, member) } });
}));

module.exports = router;
