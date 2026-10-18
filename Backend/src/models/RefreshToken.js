const mongoose = require('mongoose');

/**
 * Refresh-token store (Security audit C-2, full migration — Week 2 / §14.F).
 *
 * The previous model was a single 7-day JWT in localStorage: readable by any
 * XSS payload, valid for its whole lifetime, and impossible to revoke server-
 * side (logout was a client-side clear). The new model splits that into:
 *   • a short-lived (15 min) access-token JWT, and
 *   • a long-lived, OPAQUE, server-stored refresh token (this collection).
 *
 * Why store the refresh token here instead of making it a JWT too:
 *   • Revocability — logout / logout-everywhere can mark rows revoked. A JWT
 *     can't be un-issued.
 *   • Rotation + theft detection — every successful refresh consumes the
 *     presented token (sets revokedAt) and issues a new one in the SAME family.
 *     If a token that's ALREADY revoked is presented again, that's a replay of
 *     a stolen token: we revoke the entire family (all of that login session's
 *     descendants) so neither the attacker nor the victim can continue, and
 *     force a fresh sign-in.
 *
 * The raw token never lives in the DB — only its sha256 hash (same pattern as
 * resetPasswordToken / emailVerificationToken). The raw value lives only in
 * the HttpOnly `refresh_token` cookie.
 */
const refreshTokenSchema = new mongoose.Schema({
  memberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Member',
    required: true,
    index: true,
  },
  // sha256(rawToken). Unique so a presented token resolves to exactly one row.
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  // Login-session family id. All tokens minted by rotating from the same
  // original login share a family; theft detection revokes by family.
  family: {
    type: String,
    required: true,
    index: true,
  },
  // TTL index — Mongo auto-deletes the row at expiresAt. expireAfterSeconds:0
  // means "delete when the date field is reached".
  expiresAt: {
    type: Date,
    required: true,
  },
  // Set when the token is consumed (rotated) or explicitly revoked (logout).
  // A non-null revokedAt + a later presentation = replay → family revocation.
  revokedAt: {
    type: Date,
    default: null,
  },
  // sha256 of the token this one was rotated into (audit/forensics only).
  replacedByHash: {
    type: String,
    default: null,
  },
  // Memberships the sign-in credential proved (password matched / Google
  // verified) — the only accounts this session may switch between. Carried
  // across rotation and switches; never sent to the client.
  linked: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Member' }],
    default: undefined,
  },
  userAgent: { type: String, default: '' },
  ip: { type: String, default: '' },
}, {
  timestamps: true,
});

// Auto-expire consumed/old tokens. Keeps the collection from growing forever
// without a manual sweep.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
