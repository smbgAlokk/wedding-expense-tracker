const mongoose = require('mongoose');
const crypto = require('crypto');

const weddingSchema = new mongoose.Schema({
  weddingName: {
    type: String,
    required: [true, 'Wedding name is required'],
    trim: true,
    maxlength: [100, 'Wedding name cannot exceed 100 characters']
  },
  coupleNames: {
    partner1: { type: String, required: true, trim: true },
    partner2: { type: String, required: true, trim: true }
  },
  weddingDate: {
    type: Date,
    required: [true, 'Wedding date is required']
  },
  joinCode: {
    type: String,
    unique: true,
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
  categories: [{
    name: { type: String, required: true },
    icon: { type: String, default: '📦' },
    budgetLimit: { type: Number, default: 0 }
  }],
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

// Generate unique join code before saving
weddingSchema.pre('save', async function(next) {
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

// Add default categories if none provided
weddingSchema.pre('save', function(next) {
  if (this.isNew && (!this.categories || this.categories.length === 0)) {
    this.categories = [
      { name: 'Venue', icon: '🏛️', budgetLimit: 0 },
      { name: 'Catering', icon: '🍽️', budgetLimit: 0 },
      { name: 'Decoration', icon: '💐', budgetLimit: 0 },
      { name: 'Photography', icon: '📸', budgetLimit: 0 },
      { name: 'Outfits', icon: '👗', budgetLimit: 0 },
      { name: 'Music & DJ', icon: '🎵', budgetLimit: 0 },
      { name: 'Transport', icon: '🚗', budgetLimit: 0 },
      { name: 'Gifts', icon: '🎁', budgetLimit: 0 },
      { name: 'Jewelry', icon: '💍', budgetLimit: 0 },
      { name: 'Miscellaneous', icon: '📦', budgetLimit: 0 }
    ];
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

module.exports = mongoose.model('Wedding', weddingSchema);
