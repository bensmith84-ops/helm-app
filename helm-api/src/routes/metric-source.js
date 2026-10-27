// POST /metric-source - find Metabase data for Scorecard metrics and key results.
// Members only (default auth gate). Body.action:
//   search  {q}                        -> Metabase questions, models and tables matching q
//   fields  {model, id}                -> columns of one source (date / number / text)
//   preview {config, weeks?}           -> weekly values for the last `weeks` weeks (Scorecard)
//   preview {config, from, to}         -> the key result value over [from, to] + weekly values
// config: {kind:'metabase', model, id, db, date:{ref}, value:{ref}|null, day_agg, filters[]}
//      or {kind:'scoreboard', key} or (KR) {kind:'scorecard', metric_id}; plus agg / window_agg.

const src = require('../lib/metric-source');

module.exports = function (app, { pool }) {
  app.post('/metric-source', async (req, res) => {
    const b = req.body || {};
    try {
      if (b.action === 'search') {
        const q = String(b.q || '').trim();
        if (q.length < 2) return res.json({ results: [] });
        return res.json({ results: await src.search(q) });
      }
      if (b.action === 'fields') return res.json(await src.fields(b.model, b.id));
      if (b.action === 'preview') {
        const cfg = b.config || {};
        if (cfg.kind === 'metabase') src.cleanConfig(cfg);
        const today = src.ymd(new Date());
        if (b.from) {
          const from = String(b.from).slice(0, 10), to = String(b.to || today).slice(0, 10) > today ? today : String(b.to || today).slice(0, 10);
          const r = await src.krValue(pool, cfg, from, to);
          const weeks = cfg.kind === 'scorecard' ? [...r.series.entries()].map(([w, v]) => ({ week: w, value: v }))
            : [...src.rollWeeks(r.series, 'sum').entries()].map(([w, x]) => ({ week: w, value: x.value, days: x.days }));
          return res.json({ value: r.value, points: r.points, unit: r.unit, from, to, weeks: weeks.sort((a, b2) => (a.week < b2.week ? -1 : 1)).slice(-26) });
        }
        const n = Math.min(26, Math.max(1, Number(b.weeks) || 8));
        const start = new Date(); start.setUTCDate(start.getUTCDate() - n * 7);
        const from = src.weekStart(src.ymd(start));
        const daily = cfg.kind === 'scoreboard' ? await src.scoreboardDaily(pool, cfg.key, from, today) : await src.metabaseDaily(cfg, from, today);
        const weeks = [...src.rollWeeks(daily, b.agg || cfg.agg || 'sum').entries()].map(([w, x]) => ({ week: w, value: x.value, days: x.days })).sort((a, b2) => (a.week < b2.week ? -1 : 1));
        return res.json({ weeks, points: daily.size, from, to: today });
      }
      return res.status(400).json({ error: 'unknown action' });
    } catch (e) {
      return res.status(400).json({ error: String(e.message || e).slice(0, 400) });
    }
  });
};
