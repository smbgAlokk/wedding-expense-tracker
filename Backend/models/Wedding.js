const mongoose = require('mongoose');
const crypto = require('crypto');
const {
  WORKSPACE_TYPES,
  DEFAULT_WORKSPACE_TYPE,
  getDefaultCategories,
  getFeatures,
} = require('../constants/workspaceDefaults');

/**
 * Wedding is the underlying storage container for every vertical workspace —
 * Wedding (the original), Trip, Personal, … (see MASTER_CONTEXT.md §9). The
 * `type` discriminator selects the per-vertical default categories and feature
 * flag set; everything else (members, expenses, join codes, budget) is shared.
 *
 * Phase 0a (2026-05-27) added `type` additively; the model class, collection,
 * and `weddingId` foreign keys keep their original names until Phase 0b
 * (cosmetic rename pass, deferred until Personal + Trip ship).
 */
const weddingSchema = new mongoose.Schema({
  // Workspace type discriminator. Defaults to 'wedding' so every existing
  // document (and every legacy code path that doesn't pass a type) keeps
  // behaving exactly as before.
  type: {
    type: String,
    enum: WORKSPACE_TYPES,
    default: DEFAULT_WORKSPACE_TYPE,
    index: true,
  },
  weddingName: {
    type: String,
    required: [true, 'Workspace name is required'],
    trim: true,
    maxlength: [100, 'Workspace name cannot exceed 100 characters']
  },
  // Wedding-specific metadata. Trip / Personal verticals will not populate
  // these and the routes that touch them will gate on `type === 'wedding'`.
  coupleNames: {
    partner1: { type: String, trim: true },
    partner2: { type: String, trim: true }
  },
  weddingDate: {
    type: Date
  },
  joinCode: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    index: true
  },
  totalBudget: {
    type: Number,
    default: 0,
    min: [0, 'Budget cannot be negative']
  },
  currency: {
    type: String,
    default: '₹',
    enum: ['₹', '$', '€', '£', '¥']
  },
  // Audit M-8 (2026-05-28): cap category name length AND array size so an
  // admin can't DoS the database (or the wire) with a categories payload
  // containing thousands of multi-kilobyte names. 50 is well above the 20
  // default categories of the largest seeded vertical.
  categories: {
    type: [{
      name: { type: String, required: true, trim: true, maxlength: [60, 'Category name cannot exceed 60 characters'] },
      icon: { type: String, default: '📦', maxlength: [8, 'Category icon must be a single emoji'] },
      budgetLimit: { type: Number, default: 0, min: 0 },
    }],
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.length <= 50,
      message: 'A workspace cannot have more than 50 categories',
    },
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Member',
    default: null
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

// Generate unique join code before saving — only for vertical types that opt in.
weddingSchema.pre('save', async function(next) {
  const type = this.type || DEFAULT_WORKSPACE_TYPE;
  const features = getFeatures(type);
  if (!features.joinCode) {
    // Verticals like Personal don't surface a join code at all.
    this.joinCode = undefined;
    return next();
  }

  if (!this.joinCode) {
    let code;
    let exists = true;
    // Keep generating until we find a unique code
    while (exists) {
      code = crypto.randomBytes(3).toString('hex').toUpperCase();
      exists = await mongoose.model('Wedding').findOne({ joinCode: code });
    }
    this.joinCode = code;
  }
  next();
});

// Seed default categories for newly-created workspaces from the type-keyed map
// in constants/workspaceDefaults.js. Categories are deep-cloned so two
// documents never share a reference to the same category subdocuments.
weddingSchema.pre('save', function(next) {
  if (this.isNew && (!this.categories || this.categories.length === 0)) {
    const type = this.type || DEFAULT_WORKSPACE_TYPE;
    const defaults = getDefaultCategories(type);
    this.categories = defaults.map((c) => ({ ...c }));
  }
  next();
});

// Virtual for total spent
weddingSchema.virtual('expenses', {
  ref: 'Expense',
  localField: '_id',
  foreignField: 'weddingId'
});

weddingSchema.virtual('members', {
  ref: 'Member',
  localField: '_id',
  foreignField: 'weddingId'
});

// Feature flag matrix derived from the workspace type. UI uses this to gate
// sections (members page, join code, top contributors, …). Documented in
// constants/workspaceDefaults.js.
weddingSchema.virtual('features').get(function () {
  return getFeatures(this.type || DEFAULT_WORKSPACE_TYPE);
});

module.exports = mongoose.model('Wedding', weddingSchema);
