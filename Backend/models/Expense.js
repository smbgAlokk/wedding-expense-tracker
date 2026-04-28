const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  weddingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wedding',
    required: [true, 'Wedding ID is required'],
    index: true
  },
  memberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Member',
    required: [true, 'Member ID is required'],
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than 0'],
    validate: {
      validator: function(v) {
        // Allow up to 2 decimal places
        return /^\d+(\.\d{1,2})?$/.test(v.toString());
      },
      message: 'Amount can have at most 2 decimal places'
    }
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters'],
    default: ''
  },
  paidBy: {
    type: String,
    trim: true,
    default: ''
  },
  vendor: {
    type: String,
    trim: true,
    maxlength: [100, 'Vendor name cannot exceed 100 characters'],
    default: ''
  },
  receiptUrl: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters'],
    default: ''
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
expenseSchema.index({ weddingId: 1, createdAt: -1 });
expenseSchema.index({ weddingId: 1, category: 1 });
expenseSchema.index({ weddingId: 1, memberId: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
