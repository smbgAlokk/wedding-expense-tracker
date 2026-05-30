const { CSRF_COOKIE } = require('./auth');

/**
 * CSRF protection — double-submit cookie pattern (Security audit §14.F).
 *
 * With the C-2 migration the session lives in cookies, which the browser sends
 * automatically on every request — the classic CSRF precondition. SameSite=Lax
 * already blocks the dangerous cases (cross-site POST/PUT/DELETE won't carry the
 * cookie), but we add double-submit as defence-in-depth and to cover the
 * SameSite-edge cases (e.g. top-level POST navigations).
 *
 * Mechanism: on login we set a readable `csrf_token` cookie. The frontend echoes
 * it in the `X-CSRF-Token` header on every mutating request. A cross-site
 * attacker can ride the session cookie but CANNOT read the csrf cookie value
 * (it's same-origin only) nor set a custom header on a simple form post, so the
 * header will be absent/wrong and we reject.
 *
 * Exempt: safe methods, and the pre-auth endpoints that don't act on an ambient
 * session (login/signup/forgot/reset/verify) — there's no session to forge yet,
 * and the user has no csrf cookie on first contact. /auth/refresh, /auth/logout*
 * and ALL authenticated mutations are protected.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Exact full-path matches (these are all POSTs). Everything else under /api that
// mutates is protected — including PUT /api/weddings/current and member removal.
const EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/login/select-wedding',
  '/api/auth/google',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/weddings',
  '/api/weddings/personal',
  '/api/weddings/join',
  '/api/csp-report',
]);

const csrfProtect = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  // Normalise a possible trailing slash so '/api/weddings/' matches too.
  const path = req.path.length > 1 ? req.path.replace(/\/$/, '') : req.path;
  if (EXEMPT_PATHS.has(path)) return next();

  const cookieToken = req.cookies && req.cookies[CSRF_COOKIE];
  const headerToken = req.get('X-CSRF-Token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      success: false,
      message: 'Your session could not be verified. Please refresh the page and try again.',
      code: 'CSRF_FAILED',
    });
  }
  next();
};

module.exports = { csrfProtect };
