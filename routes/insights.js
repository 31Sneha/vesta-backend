const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { protect } = require('../middleware/auth');

router.use(protect);

// POST /api/insights/generate
router.post('/generate', async (req, res) => {
  try {
    const { summary, breakdown, month } = req.body;

    if (!summary || !breakdown) {
      return res.status(400).json({ success: false, message: 'summary and breakdown required' });
    }

    // Initialize inside the route so dotenv is already loaded
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const dataContext = `
Monthly Financial Summary for ${month}:
- Total Income: ₹${summary.income?.total || 0}
- Total Expenses: ₹${summary.expense?.total || 0}
- Net Savings: ₹${summary.netSavings || 0}
- Savings Rate: ${summary.savingsRate || 0}%

Spending Breakdown by Category:
${breakdown.map((b) => `- ${b.category}: ₹${b.total} (${b.percentage}% of total expenses)`).join('\n')}
    `.trim();

    const prompt = `
You are Vesta, a personal finance advisor for Indian users. Analyze this monthly financial data and provide 4-5 specific, actionable insights in plain English. 

${dataContext}

Rules:
- Be specific with numbers from the data
- Reference Indian financial context (₹, Indian spending patterns)
- Keep each insight to 1-2 sentences
- Be encouraging but honest
- Flag any concerning patterns
- Suggest one specific action they can take
- Do NOT give tax advice or claim to be a licensed financial advisor
- Format as a numbered list (1. 2. 3. etc.)
- End with one positive observation about their finances
    `.trim();

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    res.json({ success: true, insights: text });
  } catch (err) {
    console.error('Gemini error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to generate insights: ' + err.message });
  }
});

module.exports = router;