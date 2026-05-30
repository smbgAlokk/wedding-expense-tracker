const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const memberSchema = new mongoose.Schema({
  weddingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wedding',
    required: [true, 'Wedding ID is required'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true,
    validate: {
      validator: function(v) {
        // Email is optional for regular members, but if provided must be valid
        return !v || validator.isEmail(v);
      },
      message: 'Please provide a valid email address'
    }
  },
  password: {
    type: String,
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Never return password in queries by default
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  googleId: {
    type: String,
    sparse: true
  },
  resetPasswordToken: {
    type: String,
    select: false // hashed token; never returned by default
  },
  resetPasswordExpires: {
    type: Date,
    select: false
  },
  // Per-account brute-force lockout (Security audit H-2, 2026-05-28).
  // loginAttempts counts CONSECUTIVE failed sign-ins for this Member doc; reset
  // to 0 on any successful login. lockedUntil is set 15 min into the future
  // when loginAttempts reaches 10, after which the counter is reset to 0 (so
  // the next 10 failures past the unlock window earn the next lockout, no
  // off-by-one). Both select:false so the hot protect-middleware projection
  // and every API response stay byte-identical; only /login pulls them in.
  loginAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  lockedUntil: {
    type: Date,
    select: false
  },
  // Email verification (Security audit H-5, 2026-05-28).
  //   • emailVerifiedAt — null until the user clicks the verification link sent
  //     at signup (or proves email control via a successful password reset).
  //     Members created via Google sign-in are auto-verified (Google's
  //     verifyIdToken already enforces email_verified=true). Existing prod
  //     Members predating this rollout are backfilled as verified via
  //     scripts/backfillEmailVerified.js — they're grandfathered.
  //   • emailVerificationToken — sha256 of the one-time link token; same
  //     pattern as resetPasswordToken so the raw token only ever lives in the
  //     emailed URL, never in storage.
  //   • emailVerificationExpires — 24 h validity (longer than the 1 h reset
  //     window: users don't always check mail immediately; verification is
  //     less time-sensitive than a password reset).
  // Token fields are select:false (only the verify/resend routes pull them);
  // emailVerifiedAt is selectable so admin-action gates can read it cheaply.
  emailVerifiedAt: {
    type: Date,
    default: null
  },
  emailVerificationToken: {
    type: String,
    select: false
  },
  emailVerificationExpires: {
    type: Date,
    select: false
  },
  // ── L3 — AI Coach (Gemini Flash) ─────────────────────────────────────
  // All three fields are SELECTABLE because the frontend reads them on the
  // /coach/status endpoint to gate UI state (enable flag, daily/monthly
  // usage, waitlist join status). None are sensitive — `aiCoachEnabled` is
  // a yes/no preference, `aiUsage` is a counter, `aiWaitlistJoined` is a
  // single boolean. No tokens, no secrets.
  //
  // Default OFF — every user must explicitly opt in via the consent modal
  // in Settings. The route layer enforces this; this default is the safety
  // net for forged or out-of-band Member documents.
  aiCoachEnabled: {
    type: Boolean,
    default: false,
  },
  // Per-user rate-limit counters. Two windows tracked independently so the
  // user can burn their daily allowance without locking themselves out of
  // the entire month. Date-reset logic lives in middleware/aiQuota.js — the
  // schema just stores the latest values.
  aiUsage: {
    daily: {
      date: { type: String, default: '' },   // 'YYYY-MM-DD' in server-local TZ
      count: { type: Number, default: 0, min: 0 },
    },
    monthly: {
      month: { type: String, default: '' },  // 'YYYY-MM'
      count: { type: Number, default: 0, min: 0 },
    },
  },
  // Set true when a user hits their quota and joins the Pro waitlist. No
  // billing in v1 — this is a marketing signal + a future flag for paid
  // unlock. Doesn't affect quota enforcement.
  aiWaitlistJoined: {
    type: Boolean,
    default: false,
  },
  relation: {
    type: String,
    trim: true,
    maxlength: [50, 'Relation cannot exceed 50 characters'],
    default: 'Family'
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  avatar: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    enum: ['admin', 'member'],
    default: 'member'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // A-3 (§14.H): permanent ban, distinct from isActive (which is soft-delete +
  // re-entry). A banned member can never re-join or log back in — enforced in
  // protect + every entry path (join / login / google / select-wedding).
  bannedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index: one email per wedding (allows same email across different weddings)
memberSchema.index({ weddingId: 1, email: 1 }, {
  unique: true,
  partialFilterExpression: { email: { $type: 'string', $ne: '' } }
});

// Hash password before saving
memberSchema.pre('save', async function(next) {
  // Only hash if password was modified and exists
  if (!this.isModified('password') || !this.password) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Instance method: compare password
memberSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Virtual for member's total contribution
memberSchema.virtual('expenses', {
  ref: 'Expense',
  localField: '_id',
  foreignField: 'memberId'
});

// Generate avatar color from name
memberSchema.methods.getAvatarColor = function() {
  const colors = [
    '#D84381', '#7C3AED', '#2563EB', '#059669',
    '#D97706', '#DC2626', '#7C2D12', '#1D4ED8',
    '#9333EA', '#E11D48'
  ];
  let hash = 0;
  for (let i = 0; i < this.name.length; i++) {
    hash = this.name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// Ensure password is never included in toJSON
memberSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.googleId;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  delete obj.loginAttempts;
  delete obj.lockedUntil;
  delete obj.emailVerificationToken;
  delete obj.emailVerificationExpires;
  return obj;
};

module.exports = mongoose.model('Member', memberSchema);
