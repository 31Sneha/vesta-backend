const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

const CATEGORY_RULES = [
  { keywords: ['swiggy', 'zomato', 'food', 'restaurant', 'grocery', 'bigbasket'], category: 'Food' },
  { keywords: ['uber', 'ola', 'fuel', 'petrol', 'metro', 'irctc'], category: 'Transport' },
  { keywords: ['electricity', 'water bill', 'gas bill', 'broadband', 'wifi', 'recharge'], category: 'Utilities' },
  { keywords: ['rent', 'maintenance', 'emi home'], category: 'Housing' },
  { keywords: ['hospital', 'pharmacy', 'medical', 'doctor'], category: 'Healthcare' },
  { keywords: ['course', 'tuition', 'udemy', 'coursera', 'fees'], category: 'Education' },
  { keywords: ['netflix', 'prime', 'spotify', 'movie', 'bookmyshow'], category: 'Entertainment' },
  { keywords: ['amazon', 'flipkart', 'myntra', 'shopping'], category: 'Shopping' },
  { keywords: ['salary', 'payroll'], category: 'Salary' },
  { keywords: ['chq dep', 'funds tran', 'neft', 'imps'], category: 'Investment' },
  { keywords: ['cash wdl', 'atm', 'chgs', 'cess'], category: 'Other' },
];

function guessCategory(description = '') {
  const desc = description.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => desc.includes(k))) return rule.category;
  }
  return 'Other';
}

// Parses DD/MM/YY or DD/MM/YYYY into a JS Date
function parseIndianDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const str = value.toString().trim();
  const parts = str.split('/');
  if (parts.length !== 3) return null;

  let [day, month, year] = parts.map((p) => parseInt(p, 10));
  if (year < 100) year += year < 50 ? 2000 : 1900; // 13 -> 2013, not 1913

  const date = new Date(year, month - 1, day);
  return isNaN(date.getTime()) ? null : date;
}

// POST /api/upload/statement
router.post('/statement', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No data found in file' });
    }

    const preview = [];

    rows.forEach((row, idx) => {
      // Flexible column matching — handles HDFC's exact headers and common variants
      const dateRaw = row['Date'] || row['Value Dt'] || row['date'] || '';
      const narration = row['Narration'] || row['Description'] || row['description'] || '';
      const withdrawal = parseFloat(row['Withdrawal Amt.'] || row['Withdrawal Amt'] || row['Debit'] || 0) || 0;
      const deposit = parseFloat(row['Deposit Amt.'] || row['Deposit Amt'] || row['Credit'] || 0) || 0;

      // Skip rows with no narration and no amounts (separator/blank rows)
      if (!narration && withdrawal === 0 && deposit === 0) return;

      const parsedDate = parseIndianDate(dateRaw);
      const isIncome = deposit > 0;
      const amount = isIncome ? deposit : withdrawal;

      if (amount === 0) return; // skip rows with no real transaction amount

      preview.push({
        rowIndex: idx,
        date: parsedDate ? parsedDate.toISOString().split('T')[0] : '',
        note: narration,
        amount,
        type: isIncome ? 'income' : 'expense',
        category: guessCategory(narration),
      });
    });

    res.json({ success: true, count: preview.length, data: preview });
  } catch (err) {
    console.error('Upload/statement error:', err);
    res.status(500).json({ success: false, message: 'Failed to parse file: ' + err.message });
  }
});

// POST /api/upload/confirm
router.post('/confirm', async (req, res) => {
  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ success: false, message: 'No transactions provided' });
    }

    const docs = transactions.map((tx) => ({
      userId: req.user.id,
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      note: tx.note,
      date: tx.date ? new Date(tx.date) : new Date(),
    }));

    const inserted = [];
    for (const doc of docs) {
      const created = await Transaction.create(doc);
      inserted.push(created);
    }

    res.status(201).json({ success: true, count: inserted.length });
  } catch (err) {
    console.error('Upload/confirm error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;