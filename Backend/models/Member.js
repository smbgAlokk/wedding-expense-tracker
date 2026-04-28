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
  return obj;
};

module.exports = mongoose.model('Member', memberSchema);
