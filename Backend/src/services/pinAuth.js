const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Member = require('../models/Member');

// Family members who join by code authenticate with a 6-digit PIN (UPI-style).
// Low entropy → bcrypt + a per-account lockout make guessing infeasible:
// 5 tries / 15 min ≈ 480 guesses/day against 10^6 combinations.
const PIN_RE = /^\d{6}$/;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;
const RESET_CODE_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L — read aloud over the phone

// Fields the PIN flows need; all are select:false on the schema.
const PIN_FIELDS = '+password +pinHash +pinResetCodeHash +pinResetExpires +loginAttempts +lockedUntil';

// Only plain join-code members use a PIN; admins / email / Google accounts use Login.
const usesPin = (m) => m.role === 'member' && !m.email && !m.googleId && !m.password;

// Returns an error code, or null if acceptable. Rejects the guess-first PINs.
function pinProblem(pin) {
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) return 'PIN_FORMAT';
  const d = [...pin].map(Number);
  const step = d[1] - d[0];
  const sequential = Math.abs(step) <= 1 && d.every((v, i) => i === 0 || v - d[i - 1] === step);
  return sequential ? 'PIN_WEAK' : null; // step 0 = repeated digits (000000), ±1 = 123456 / 654321
}

const hashPin = (pin) => bcrypt.hash(pin, 12);

const hashResetCode = (raw) =>
  crypto.createHash('sha256').update(String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

function mintResetCode() {
  const raw = Array.from({ length: 8 }, () => RESET_ALPHABET[crypto.randomInt(RESET_ALPHABET.length)]).join('');
  return {
    code: `${raw.slice(0, 4)}-${raw.slice(4)}`,
    codeHash: hashResetCode(raw),
    expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
  };
}

const resetCodeMatches = (member, raw) => {
  if (!member.pinResetCodeHash || !member.pinResetExpires || member.pinResetExpires <= new Date()) return false;
  const a = Buffer.from(hashResetCode(raw));
  const b = Buffer.from(member.pinResetCodeHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * Runs `check` under the per-member lockout. Resolves 'ok' | 'wrong' | 'locked'.
 * The counter is incremented atomically so parallel guesses can't slip past it.
 */
async function attemptWithLockout(member, check) {
  if (member.lockedUntil && member.lockedUntil > new Date()) return 'locked';

  if (await check()) {
    if (member.loginAttempts || member.lockedUntil) {
      await Member.updateOne({ _id: member._id }, { $set: { loginAttempts: 0 }, $unset: { lockedUntil: 1 } });
    }
    return 'ok';
  }

  const { loginAttempts } = await Member.findByIdAndUpdate(
    member._id,
    { $inc: { loginAttempts: 1 } },
    { new: true }
  ).select('+loginAttempts').lean();

  if (loginAttempts >= MAX_PIN_ATTEMPTS) {
    await Member.updateOne(
      { _id: member._id },
      { $set: { loginAttempts: 0, lockedUntil: new Date(Date.now() + PIN_LOCK_MS) } }
    );
    return 'locked';
  }
  return 'wrong';
}

// Uniform failure responses. Never 401: the client treats 401 as "session expired".
const PIN_ERRORS = {
  PIN_FORMAT: [400, 'PIN must be exactly 6 digits.'],
  PIN_WEAK: [400, 'This PIN is too easy to guess. Avoid repeated or sequential digits.'],
  wrong: [400, 'Incorrect PIN.', 'WRONG_PIN'],
  locked: [429, 'Too many wrong attempts. Try again in 15 minutes or ask the organiser to reset your PIN.', 'PIN_LOCKED'],
};

function sendPinError(res, key) {
  const [status, message, code = key] = PIN_ERRORS[key];
  return res.status(status).json({ success: false, code, message });
}

module.exports = {
  PIN_FIELDS,
  usesPin,
  pinProblem,
  hashPin,
  mintResetCode,
  resetCodeMatches,
  attemptWithLockout,
  sendPinError,
};
