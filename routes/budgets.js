const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');

// All budget routes require login
router.use(protect);

// Maps a transaction's category to the budget category it should count toward.
// Add new entries here any time you introduce a new transaction category.
const CATEGORY_TO_BUDGET = {
  Food: 'Food',
  Groceries: 'Food',
  Utilities: 'Utilities',
  Rent: 'Housing',
  Transport: 'Other',
  Entertainment: 'Entertainment',
  Education: 'Education',
};

function mapToBudgetCategory(transactionCategory) {
  return CATEGORY_TO_BUDGET[transactionCategory] || 'Other';
}

// POST /api/budgets — Create a new budget
router.post('/', async (req, res) => {
  try {
    const { category, limit, period, month, notes } = req.body;

    const budget = await Budget.create({
      user: req.user.id,
      category,
      limit,
      period: period || 'monthly',
      month,
      notes,
    });

    res.status(201).json({ success: true, data: budget });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A budget for this category and month already exists.',
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/budgets — Get all budgets (filter by month if provided)
router.get('/', async (req, res) => {
  try {
    const filter = { user: req.user.id };
    if (req.query.month) filter.month = req.query.month;

    const budgets = await Budget.find(filter).sort({ category: 1 });
    res.json({ success: true, count: budgets.length, data: budgets });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/budgets/summary?month=2025-07 — Budget vs actual spending
router.get('/summary', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({ success: false, message: 'month query param required (YYYY-MM)' });
    }

    const [year, mon] = month.split('-').map(Number);
    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 1);

    const budgets = await Budget.find({ user: req.user.id, month });

    const spending = await Transaction.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user.id),
          type: 'expense',
          date: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
        },
      },
    ]);

    // Roll raw transaction categories up into budget categories
    const spendingMap = {};
    spending.forEach((s) => {
      const budgetCategory = mapToBudgetCategory(s._id);
      spendingMap[budgetCategory] = (spendingMap[budgetCategory] || 0) + s.total;
    });

    const summary = budgets.map((b) => {
      const spent = spendingMap[b.category] || 0;
      const remaining = b.limit - spent;
      const percentage = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
      return {
        category: b.category,
        limit: b.limit,
        spent,
        remaining,
        percentage,
        status: percentage >= 100 ? 'exceeded' : percentage >= 80 ? 'warning' : 'on-track',
        budgetId: b._id,
      };
    });

    res.json({ success: true, month, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/budgets/:id — Get one budget
router.get('/:id', async (req, res) => {
  try {
    const budget = await Budget.findOne({ _id: req.params.id, user: req.user.id });
    if (!budget) return res.status(404).json({ success: false, message: 'Budget not found' });
    res.json({ success: true, data: budget });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/budgets/:id — Update a budget
router.put('/:id', async (req, res) => {
  try {
    const { category, limit, period, month, notes } = req.body;
    const budget = await Budget.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { category, limit, period, month, notes },
      { new: true, runValidators: true }
    );
    if (!budget) return res.status(404).json({ success: false, message: 'Budget not found' });
    res.json({ success: true, data: budget });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/budgets/:id — Delete a budget
router.delete('/:id', async (req, res) => {
  try {
    const budget = await Budget.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!budget) return res.status(404).json({ success: false, message: 'Budget not found' });
    res.json({ success: true, message: 'Budget deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;