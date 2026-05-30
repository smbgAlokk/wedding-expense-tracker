const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Member = require('../models/Member');
const RefreshToken = require('../models/RefreshToken');
const Wedding = require('../models/Wedding');
const { hashToken } = require('../utils/verificationToken');
const { canAct } = require('../utils/authz');

// ─── Cookie / token lifetimes (Security audit C-2 full migration, §14.F) ────
//
// Access token: short-lived JWT (default 15 min). Refresh token: long-lived,
// opaque, server-stored (default 30 days). A stolen access token is useless
// after 15 min; a stolen refresh token is revocable and rotates on every use.
function parseDuration(value, fallbackMs) {
  if (value === undefined || value === null || value === '') return fallbackMs;
  if (/^\d+$/.test(String(value))) return Number(value); // bare number = ms
  const m = String(value).trim().match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return n * mult;
}

const ACCESS_TTL_MS = parseDuration(process.env.ACCESS_TOKEN_TTL, 15 * 60 * 1000);
const REFRESH_TTL_MS = parseDuration(process.env.REFRESH_TOKEN_TTL, 30 * 24 * 60 * 60 * 1000);

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';
const CSRF_COOKIE = 'csrf_token';

const isProd = () => process.env.NODE_ENV === 'production';
// Secure defaults to on in production, off in dev (so http://localhost works).
// COOKIE_SECURE env override wins (string 'true'/'false').
const cookieSecure = () =>
  process.env.COOKIE_SECURE !== undefined ? process.env.COOKIE_SECURE === 'true' : isProd();
// SameSite=Lax works because the API is served same-origin via the Vercel
// proxy (and the Vite dev proxy locally) — the cookie is first-party.
const cookieSameSite = () => process.env.COOKIE_SAMESITE || 'lax';

// Base options shared by all three cookies. NOTE: no `domain` — host-only
// cookies bind to whatever origin the browser saw (the Vercel/localhost
// origin), which is exactly what we want for the same-origin proxy model.
const baseCookieOpts = () => ({
  secure: cookieSecure(),
  sameSite: cookieSameSite(),
  path: '/',
});

/**
 * Auth middleware - Extracts member from the access-token JWT.
 * Reads the token from the HttpOnly `access_token` cookie first (browser
 * sessions), falling back to an `Authorization: Bearer` header for non-browser
 * clients / transition. The frontend no longer sends a Bearer header.
 */
const protect = async (req, res, next) => {
  try {
    let token = req.cookies && req.cookies[ACCESS_COOKIE];

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Please sign in to access this feature'
      });
    }

    // Verify token — algorithm pinned to HS256 (audit H-6, 2026-05-28) to block
    // algorithm-confusion edge cases.
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Reject anything that isn't a session access token. Selector tokens
    // (purpose: 'select-wedding') carry no `id`; a forged/mis-used token with
    // no subject must never resolve to a member.
    if (!decoded.id || decoded.purpose === 'select-wedding') {
      return res.status(401).json({
        success: false,
        message: 'Invalid session. Please sign in again.'
      });
    }

    // Check if member still exists and is active.
    // Runs on EVERY authenticated request, so keep it as cheap as possible:
    //  • select only the fields downstream code actually reads
    //  • .lean() — skip Mongoose document hydration (we never .save() req.member)
    const member = await Member.findById(decoded.id)
      .select('name role isActive weddingId bannedAt')
      .lean();

    if (!member) {
      return res.status(401).json({
        success: false,
        message: 'This member no longer exists'
      });
    }

    // A-3 (§14.H): a permanently-banned member's existing session dies here.
    if (member.bannedAt) {
      return res.status(401).json({
        success: false,
        message: 'Your access has been permanently revoked.'
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
        message: 'Invalid session. Please sign in again.'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Your session has expired. Please sign in again.'
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
 * loadWorkspace (A-2, §14.H) — fetch the member's workspace once and expose it
 * as req.workspace / req.features so routes don't each re-query it (helps M-13).
 * Use after protect on routes that need workspace context.
 */
const loadWorkspace = async (req, res, next) => {
  try {
    const wedding = await Wedding.findById(req.weddingId);
    if (!wedding) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }
    req.workspace = wedding;
    req.features = wedding.features;
    next();
  } catch (err) { next(err); }
};

/**
 * requireAction (A-1, §14.H) — central authorization gate via canAct(), replacing
 * scattered ad-hoc role checks. Use after protect (+ loadWorkspace when the
 * action needs workspace context).
 */
const requireAction = (action) => (req, res, next) => {
  if (!canAct(req.member, req.workspace, action)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
  }
  next();
};

// ─── Access token ──────────────────────────────────────────────────────────

/**
 * Generate a short-lived access-token JWT for a member. `type: 'access'`
 * distinguishes it from selector tokens.
 */
const generateAccessToken = (memberId) =>
  jwt.sign(
    { id: memberId, type: 'access' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: Math.floor(ACCESS_TTL_MS / 1000) }
  );

// Backwards-compatible alias. Older call sites imported `generateToken`; they
// now all route through issueSession, but keep the export so any straggler
// import keeps working (it just mints an access token).
const generateToken = generateAccessToken;

// ─── Refresh tokens (opaque, server-stored, rotating) ───────────────────────

/**
 * Create + persist a new refresh token row. Returns the raw token (goes in the
 * cookie, never stored) plus its hash + family. Pass an existing `family` when
 * rotating so descendants stay linked for theft-detection revocation.
 */
async function createRefreshToken(memberId, req, family) {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(rawToken);
  const fam = family || crypto.randomBytes(16).toString('hex');
  await RefreshToken.create({
    memberId,
    tokenHash,
    family: fam,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    userAgent: (req && req.headers && req.headers['user-agent']) || '',
    ip: (req && req.ip) || '',
  });
  return { rawToken, tokenHash, family: fam };
}

/**
 * Rotate a presented refresh token: consume the old one, issue a new one in the
 * same family. Throws a tagged 401 on missing/expired tokens. On detecting a
 * REPLAY (a token already revoked being presented again) it revokes the whole
 * family and throws — the session is considered compromised.
 */
async function rotateRefreshToken(rawToken, req) {
  if (!rawToken || typeof rawToken !== 'string') {
    const err = new Error('Your session has expired. Please sign in again.');
    err.statusCode = 401;
    throw err;
  }
  const tokenHash = hashToken(rawToken);
  const existing = await RefreshToken.findOne({ tokenHash });

  if (!existing) {
    const err = new Error('Your session has expired. Please sign in again.');
    err.statusCode = 401;
    throw err;
  }

  const now = new Date();
  if (existing.revokedAt) {
    // Replay of an already-consumed token → likely theft. Burn the family.
    await revokeFamily(existing.family);
    const err = new Error('Your session was ended for security reasons. Please sign in again.');
    err.statusCode = 401;
    throw err;
  }
  if (existing.expiresAt < now) {
    const err = new Error('Your session has expired. Please sign in again.');
    err.statusCode = 401;
    throw err;
  }

  const next = await createRefreshToken(existing.memberId, req, existing.family);
  existing.revokedAt = now;
  existing.replacedByHash = next.tokenHash;
  await existing.save();

  return { memberId: existing.memberId, rawToken: next.rawToken };
}

async function revokeRefreshToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return;
  await RefreshToken.updateOne(
    { tokenHash: hashToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

async function revokeFamily(family) {
  if (!family) return;
  await RefreshToken.updateMany(
    { family, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

async function revokeAllForMember(memberId) {
  if (!memberId) return;
  await RefreshToken.updateMany(
    { memberId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

// ─── Session cookies ─────────────────────────────────────────────────────────

function setSessionCookies(res, { accessToken, refreshToken, csrf }) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookieOpts(),
    httpOnly: true,
    maxAge: ACCESS_TTL_MS,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookieOpts(),
    httpOnly: true,
    maxAge: REFRESH_TTL_MS,
  });
  // CSRF token is intentionally readable by JS (double-submit pattern): the
  // frontend echoes it back in the X-CSRF-Token header on mutating requests.
  res.cookie(CSRF_COOKIE, csrf, {
    ...baseCookieOpts(),
    httpOnly: false,
    maxAge: REFRESH_TTL_MS,
  });
}

function clearSessionCookies(res) {
  const opts = baseCookieOpts();
  res.clearCookie(ACCESS_COOKIE, { ...opts, httpOnly: true });
  res.clearCookie(REFRESH_COOKIE, { ...opts, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...opts, httpOnly: false });
}

/**
 * The single entry point every successful-auth path calls. Mints an access
 * token, creates a fresh refresh-token family, generates a CSRF token, and
 * sets all three cookies. Replaces the old "return token in JSON body" model
 * (which exposed the token to any XSS — the whole point of C-2).
 */
async function issueSession(res, req, member) {
  const accessToken = generateAccessToken(member._id);
  const { rawToken: refreshToken } = await createRefreshToken(member._id, req);
  const csrf = crypto.randomBytes(24).toString('hex');
  setSessionCookies(res, { accessToken, refreshToken, csrf });
}

// ─── Selector tokens (Security audit C-1, 2026-05-28) ──────────────────────
//
// When a login attempt resolves to MORE than one wedding, the server can't
// issue a session yet — the user hasn't picked which wedding to enter. The
// multi-wedding step mints a short-lived, purpose-restricted selector token;
// /select-wedding verifies the token's signature, purpose, and the requested
// memberId against the embedded allowlist before issuing a real session.
// See §14 (C-1) in MASTER_CONTEXT.md for the full attack path.
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
 * Error on any failure. We deliberately do NOT distinguish "expired" from
 * "tampered" — both are equally actionable for the user (sign in again).
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

module.exports = {
  protect,
  adminOnly,
  loadWorkspace,
  requireAction,
  generateToken,
  generateAccessToken,
  generateSelectorToken,
  verifySelectorToken,
  issueSession,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeFamily,
  revokeAllForMember,
  setSessionCookies,
  clearSessionCookies,
  createRefreshToken,
  REFRESH_COOKIE,
  ACCESS_COOKIE,
  CSRF_COOKIE,
};
