const { CSRF_COOKIE, ACCESS_COOKIE, REFRESH_COOKIE } = require('./auth');

/**
 * CSRF protection — double-submit cookie pattern (Security audit §14.F).
 *
 * CSRF abuses AMBIENT credentials: cookies the browser attaches on its own.
 * So the check applies exactly when a request carries a session cookie. With
 * none there is no authority to forge, and pre-auth endpoints (login, signup,
 * join, reset, verify) work for signed-out visitors without a hand-maintained
 * exemption list that every new route must remember. Bearer-header clients
 * aren't CSRF-able (browsers never attach that header cross-site).
 *
 * Mechanism: on sign-in the server sets a JS-readable `csrf_token` cookie; the
 * client echoes it in `X-CSRF-Token` on every mutating request. A cross-site
 * attacker can ride the session cookies but can neither read the csrf cookie
 * nor set a custom header, so forged requests are rejected. SameSite=Lax is the
 * first line of defence; this covers its edge cases.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Browser-generated, carries cookies, can't add headers — and changes no state.
const EXEMPT_PATHS = new Set(['/api/csp-report']);

const csrfProtect = (req, res, next) => {
  if (SAFE_METHODS.has(req.method) || EXEMPT_PATHS.has(req.path)) return next();

  const cookies = req.cookies || {};
  if (!cookies[ACCESS_COOKIE] && !cookies[REFRESH_COOKIE]) return next();

  const cookieToken = cookies[CSRF_COOKIE];
  const headerToken = req.get('X-CSRF-Token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    req.log?.warn({ path: req.path }, 'CSRF check failed');
    return res.status(403).json({
      success: false,
      message: 'Your session could not be verified. Please refresh the page and try again.',
      code: 'CSRF_FAILED',
    });
  }
  next();
};

module.exports = { csrfProtect };
