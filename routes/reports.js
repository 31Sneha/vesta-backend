const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');

router.use(protect);

// GET /api/reports/monthly-summary?month=2026-06
// Income vs expense totals + net savings for a month
router.get('/monthly-summary', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ success: false, message: 'month required (YYYY-MM)' });

    const [year, mon] = month.split('-').map(Number);
    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 1);

    const result = await Transaction.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user.id),
          date: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const income = result.find((r) => r._id === 'income') || { total: 0, count: 0 };
    const expense = result.find((r) => r._id === 'expense') || { total: 0, count: 0 };
    const netSavings = income.total - expense.total;
    const savingsRate = income.total > 0 ? ((netSavings / income.total) * 100).toFixed(1) : '0.0';

    res.json({
      success: true,
      month,
      data: {
        income: { total: income.total, count: income.count },
        expense: { total: expense.total, count: expense.count },
        netSavings,
        savingsRate: parseFloat(savingsRate),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/category-breakdown?month=2026-06&type=expense
// Spending (or income) broken down by category
router.get('/category-breakdown', async (req, res) => {
  try {
    const { month, type = 'expense' } = req.query;
    if (!month) return res.status(400).json({ success: false, message: 'month required (YYYY-MM)' });

    const [year, mon] = month.split('-').map(Number);
    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 1);

    const breakdown = await Transaction.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user.id),
          type,
          date: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);

    const grandTotal = breakdown.reduce((sum, b) => sum + b.total, 0);
    const data = breakdown.map((b) => ({
      category: b._id,
      total: b.total,
      count: b.count,
      percentage: grandTotal > 0 ? parseFloat(((b.total / grandTotal) * 100).toFixed(1)) : 0,
    }));

    res.json({ success: true, month, type, grandTotal, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/trends?months=6
// Monthly income + expense totals for the last N months
router.get('/trends', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 6;

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const result = await Transaction.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user.id),
          date: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            type: '$type',
          },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const monthMap = {};
    result.forEach(({ _id, total }) => {
      const key = `${_id.year}-${String(_id.month).padStart(2, '0')}`;
      if (!monthMap[key]) monthMap[key] = { month: key, income: 0, expense: 0 };
      monthMap[key][_id.type] = total;
    });

    const data = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/top-expenses?month=2026-06&limit=5
// Top N individual expense transactions in a month
router.get('/top-expenses', async (req, res) => {
  try {
    const { month } = req.query;
    const limit = parseInt(req.query.limit) || 5;
    if (!month) return res.status(400).json({ success: false, message: 'month required (YYYY-MM)' });

    const [year, mon] = month.split('-').map(Number);
    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 1);

    const transactions = await Transaction.find({
      userId: req.user.id,
      type: 'expense',
      date: { $gte: startDate, $lt: endDate },
    })
      .sort({ amount: -1 })
      .limit(limit)
      .select('amount category date note');

    res.json({ success: true, month, data: transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;