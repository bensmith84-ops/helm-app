
// POST /fin-analyze — port of supabase/functions/fin-analyze
// AI-powered Q1 P&L analyzer with reclassify capability.
const Anthropic = require('@anthropic-ai/sdk');
const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001';

module.exports = function(app, { pool }) {
  app.post('/fin-analyze', async (req, res) => {
    try {
      const { action, data } = req.body || {};
      const orgId = DEFAULT_ORG_ID;

      if (action === 'analyze') {
        const { rows: reports } = await pool.query(
          `SELECT id, title, total_amount, description FROM fin_expense_reports
           WHERE org_id = $1 ORDER BY total_amount DESC`,
          [orgId]
        );

        const typeMap = { '1':'Assets','2':'Liabilities','3':'Equity','4':'Revenue','5':'COGS','6':'Operating Expenses' };
        const byType = {};
        for (const r of reports) {
          const code = (r.title || '').match(/^(\d+)/)?.[1] || '0';
          const type = typeMap[code.substring(0, 1)] || 'Other';
          if (!byType[type]) byType[type] = { total: 0, accounts: [] };
          byType[type].total += Number(r.total_amount || 0);
          byType[type].accounts.push({
            title: r.title, amount: Number(r.total_amount || 0),
            txns: r.description?.match(/(\d+) txns/)?.[1] || '0',
          });
        }

        const topReports = [...reports].sort((a, b) => Math.abs(Number(b.total_amount)) - Math.abs(Number(a.total_amount))).slice(0, 15);
        const sampleTxns = [];
        for (const rep of topReports) {
          const { rows: items } = await pool.query(
            `SELECT vendor_name, amount, notes, date FROM fin_expense_items
             WHERE report_id = $1 ORDER BY amount DESC LIMIT 3`,
            [rep.id]
          );
          for (const t of items) {
            let meta = {}; try { meta = JSON.parse(t.notes || '{}'); } catch (_) {}
            sampleTxns.push({
              vendor: t.vendor_name, amount: t.amount, account: rep.title,
              type: meta.txn_type || '', split: meta.split || '', date: t.date,
            });
          }
        }

        const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
        if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

        const plSummary = Object.entries(byType).map(([type, d]) => `${type}: $${d.total.toLocaleString()} (${d.accounts.length} accounts)`).join('\n');
        const topAccts = Object.values(byType).flatMap(d => d.accounts).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 15)
          .map(a => `  ${a.title}: $${a.amount.toLocaleString()} (${a.txns} txns)`).join('\n');
        const txnLines = sampleTxns.slice(0, 30).map(t => `  ${t.date} | ${t.vendor} | $${t.amount?.toLocaleString()} | ${t.account} | ${t.type}`).join('\n');

        const prompt = `You are a financial analyst for Earth Breeze Inc., a DTC e-commerce laundry products company. Analyze Q1 2026 data.\n\nP&L:\n${plSummary}\n\nTOP ACCOUNTS:\n${topAccts}\n\nSAMPLE TRANSACTIONS:\n${txnLines}\n\nRespond ONLY with JSON (no markdown):\n{"summary":"2-3 sentence summary","trends":[{"title":"...","description":"...","severity":"info|warning|critical"}],"misclassifications":[{"vendor":"...","current_account":"...","suggested_account":"...","reason":"...","impact":"$X"}],"recommendations":[{"title":"...","description":"...","priority":"high|medium|low"}]}`;

        const client = new Anthropic({ apiKey });
        const aiResp = await client.messages.create({
          model: 'claude-sonnet-4-20250514', max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        });
        const responseText = aiResp.content?.[0]?.text || '{}';
        let analysis;
        try { analysis = JSON.parse(responseText.replace(/```json\n?|```/g, '').trim()); }
        catch (e) { analysis = { summary: responseText, trends: [], misclassifications: [], recommendations: [] }; }
        return res.json(analysis);
      }

      if (action === 'reclassify') {
        const { vendor, from_account, to_account } = data || {};
        const { rows: toR } = await pool.query(`SELECT id FROM fin_expense_reports WHERE title = $1 LIMIT 1`, [to_account]);
        const { rows: fromR } = await pool.query(`SELECT id FROM fin_expense_reports WHERE title = $1 LIMIT 1`, [from_account]);
        if (!toR[0] || !fromR[0]) return res.status(400).json({ error: 'Account not found' });

        const toCode = to_account.match(/^(\d+)/)?.[1];
        const { rows: toAcct } = await pool.query(
          `SELECT id FROM fin_accounts WHERE org_id = $1 AND code = $2 LIMIT 1`,
          [orgId, toCode]
        );

        const { rows: moved } = await pool.query(
          `UPDATE fin_expense_items SET report_id = $1, account_id = $2
           WHERE report_id = $3 AND vendor_name = $4 RETURNING id, amount`,
          [toR[0].id, toAcct[0]?.id || null, fromR[0].id, vendor]
        );

        for (const reportId of [fromR[0].id, toR[0].id]) {
          const { rows: items } = await pool.query(
            `SELECT amount FROM fin_expense_items WHERE report_id = $1`,
            [reportId]
          );
          const total = items.reduce((s, i) => s + Number(i.amount || 0), 0);
          await pool.query(
            `UPDATE fin_expense_reports SET total_amount = $1, description = $2 WHERE id = $3`,
            [total, `QBO Transaction Detail: ${items.length} txns`, reportId]
          );
        }

        return res.json({
          success: true,
          moved: moved.length,
          amount: moved.reduce((s, m) => s + Number(m.amount || 0), 0),
        });
      }

      return res.status(400).json({ error: 'Unknown action' });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
};
