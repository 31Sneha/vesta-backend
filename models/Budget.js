const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
    },
    limit: {
      type: Number,
      required: [true, 'Budget limit is required'],
      min: [0, 'Limit must be positive'],
    },
    period: {
      type: String,
      enum: ['weekly', 'monthly', 'yearly'],
      default: 'monthly',
    },
    month: {
      type: String,
      match: [/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 300,
    },
  },
  { timestamps: true }
);

// Prevent duplicate budgets for same category + month
budgetSchema.index({ user: 1, category: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);