const crypto = require('crypto');

// Email verification (Security audit H-5, 2026-05-28).
//
// Shared between authRoutes (resend + verify endpoints) and weddingRoutes
// (wedding-create + personal-create signup paths). The raw token never lives
// in storage — only the sha256 hash + expiry are persisted on the Member doc.
// Same pattern as resetPasswordToken; lifted into a util because three call
// sites mint these (signup x2, resend x1) and one consumes them (verify).
//
// 24 h validity: longer than the 1 h password-reset window because new users
// don't always check email immediately and verification is less time-sensitive
// than a reset. Short enough that a leaked-log scenario doesn't grant
// indefinite hijack potential.

const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

/**
 * Mint a fresh verification token. Returns the raw token (embed in the email
 * URL, never persist), the sha256 hash (write to Member.emailVerificationToken),
 * and the expiry Date (write to Member.emailVerificationExpires). Caller is
 * responsible for assigning + saving — so transactions can wrap the write.
 */
function mintEmailVerificationToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  return {
    rawToken,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS),
  };
}

module.exports = {
  EMAIL_VERIFICATION_EXPIRY_MS,
  hashToken,
  mintEmailVerificationToken,
};
