const jwt = require('jsonwebtoken');
const Member = require('../models/Member');

/**
 * Auth middleware - Extracts member from JWT token
 * Family-friendly: no passwords, just token-based session after joining
 */
const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Please join a wedding first to access this feature'
      });
    }

    // Verify token — algorithm pinned to HS256 (audit H-6, 2026-05-28) to block
    // algorithm-confusion edge cases. generateToken / generateSelectorToken
    // both sign with HS256 explicitly; any token claiming a different alg is a
    // forgery attempt and must be rejected.
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Check if member still exists and is active.
    // Runs on EVERY authenticated request, so keep it as cheap as possible:
    //  • select only the fields downstream code actually reads
    //  • .lean() — skip Mongoose document hydration (we never .save() req.member)
    //  • NO .populate('weddingId') — the weddingId ObjectId is already on the
    //    member; populating fetched the whole Wedding doc (20 categories) on
    //    every request for nothing. Routes that need the wedding load it themselves.
    const member = await Member.findById(decoded.id)
      .select('name role isActive weddingId')
      .lean();

    if (!member) {
      return res.status(401).json({
        success: false,
        message: 'This member no longer exists'
      });
    }

    if (!member.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your access has been deactivated by the wedding admin'
      });
    }

    req.member = member;
    req.weddingId = member.weddingId;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid session. Please rejoin the wedding.'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Your session has expired. Please rejoin.'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

/**
 * Admin-only middleware
 */
const adminOnly = (req, res, next) => {
  if (req.member.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Only the wedding admin can perform this action'
    });
  }
  next();
};

/**
 * Generate JWT for a member.
 *
 * Default lifetime dropped from 30d → 7d on 2026-05-28 as the interim C-2
 * mitigation (Security audit §14): the full HttpOnly cookie + refresh-token
 * rotation migration is queued for Week 2. Until that lands, a stolen token
 * (XSS, leaked localStorage, compromised npm dep) grants account access for
 * its full lifetime — shrinking the window from a month to a week
 * meaningfully reduces blast radius without an architecture change.
 * `JWT_EXPIRES_IN` env override still wins for operator-driven overrides.
 */
const generateToken = (memberId) => {
  return jwt.sign(
    { id: memberId },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// ─── Selector tokens (Security audit C-1, 2026-05-28) ──────────────────────
//
// When a login attempt resolves to MORE than one wedding (same email created
// accounts in several workspaces), the server can't issue a session token yet
// because the user hasn't picked which wedding to enter. The historical flow
// returned the list of matching memberIds in the response and trusted the next
// `POST /api/auth/login/select-wedding` request to pick the right one — with
// NO authentication on that follow-up endpoint. That meant any member who
// could discover another member's `_id` (via the workspace's member list, for
// example) could trade it for a JWT and impersonate them. See §14 (C-1) in
// MASTER_CONTEXT.md for the full attack path.
//
// The fix: the multi-wedding step now mints a short-lived, purpose-restricted
// selector token. /select-wedding verifies the token's signature, purpose, and
// the requested memberId against the embedded allowlist. The token is NOT a
// session — it cannot be used against any other endpoint, and it expires in
// 5 minutes regardless. Whoever holds the selector token has already passed
// password/Google verification within the last 5 minutes; whoever does NOT
// has no way to convert a known memberId into a session.
//
// Token shape:
//   { sub: <email>, purpose: 'select-wedding', members: [<memberId>, …], iat, exp }
const SELECTOR_TOKEN_EXPIRES_IN = '5m';

const generateSelectorToken = (email, memberIds) => {
  return jwt.sign(
    {
      sub: email,
      purpose: 'select-wedding',
      members: memberIds.map(String),
    },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: SELECTOR_TOKEN_EXPIRES_IN }
  );
};

/**
 * Verify a selector token. Returns the payload on success; throws a tagged
 * Error on any failure (caller catches and returns 401 to the client). We
 * deliberately do NOT distinguish between "expired" and "tampered" in the
 * thrown error to avoid leaking which condition triggered — both are equally
 * actionable for the user (sign in again).
 */
const verifySelectorToken = (token) => {
  if (!token || typeof token !== 'string') {
    const err = new Error('Missing selector token');
    err.statusCode = 401;
    throw err;
  }
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    const err = new Error('Your sign-in session expired. Please sign in again.');
    err.statusCode = 401;
    throw err;
  }
  if (payload.purpose !== 'select-wedding' || !Array.isArray(payload.members)) {
    const err = new Error('Invalid selector token');
    err.statusCode = 401;
    throw err;
  }
  return payload;
};

module.exports = { protect, adminOnly, generateToken, generateSelectorToken, verifySelectorToken };
