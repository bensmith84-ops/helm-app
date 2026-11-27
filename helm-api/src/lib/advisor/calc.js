// Deterministic chemistry and commercial calculations for the R&D Advisor.
// The model calls these through tools instead of doing arithmetic in its head.
// Everything here is pure (no I/O) so it can be unit tested.

const round = (n, d = 2) => (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return isFinite(n) ? n : null; };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ───────────────────────── units ─────────────────────────
const MASS_TO_KG = { kg: 1, kgs: 1, kilogram: 1, kilograms: 1, g: 0.001, gram: 0.001, grams: 0.001, mg: 1e-6, lb: 0.45359237, lbs: 0.45359237, pound: 0.45359237, pounds: 0.45359237, oz: 0.028349523125, t: 1000, mt: 1000, tonne: 1000, tonnes: 1000, ton: 1000, metric_ton: 1000 };
function kgPer(uom) { const k = norm(uom).replace(/ /g, '_'); return MASS_TO_KG[k] ?? null; }
// price per <uom> → price per kg (null when the unit is not a mass)
function pricePerKg(price, uom) { const p = num(price); const f = kgPer(uom || 'kg'); return p == null || !f ? null : p / f; }
function massToGrams(v, uom) { const n = num(v); const f = kgPer(uom || 'g'); return n == null || !f ? null : n * f * 1000; }

// ───────────────────────── ingredient classes ─────────────────────────
// Ordered: first match wins. Patterns run against "name | inci | function".
const CLASSES = [
  ['enzyme', 'Enzyme', /\b(protease|subtilisin|amylase|lipase|cellulase|mannanase|pectate lyase|pectinase|xyloglucanase|nuclease|dnase|enzyme|savinase|stainzyme|lipex|carezyme|mannaway|termamyl|purafect|preferenz|effectenz|excellenz|biotouch|celluclean|amplify)\b/],
  ['bleach', 'Bleach / activator', /\b(percarbonate|perborate|hydrogen peroxide|taed|tetraacetylethylenediamine|nobs|hypochlorite|peracetic|mn tacn|bleach catalyst|sodium carbonate peroxyhydrate)\b/],
  ['film', 'Film former / matrix', /\b(polyvinyl alcohol|pvoh|pva|pullulan|hydroxypropyl methylcellulose|hpmc|film form)/],
  ['plasticizer', 'Plasticiser / humectant', /\b(glycerin|glycerol|sorbitol|plasticiz|plasticis|propanediol|1 3 propanediol)\b/],
  ['filler', 'Filler / process aid', /\b(sodium sulfate|sodium sulphate|sodium chloride|magnesium sulfate|magnesium sulphate)\b/],
  ['anionic', 'Anionic surfactant', /\b(lauryl sulfate|laureth sulfate|coco sulfate|sulfate|sulphate|sulfonate|sulphonate|\blas\b|dodecylbenzene|\bsls\b|\bsles\b|\baes\b|\bmes\b|\baos\b|olefin sulfonate|isethionate|sarcosinate|taurate|sulfosuccinate|soap|sodium cocoate|potassium cocoate|fatty acid salt|sodium stearate|carboxylate)\b/],
  ['amphoteric', 'Amphoteric surfactant', /\b(betaine|amine oxide|amphoacetate|sultaine|lauramine oxide|cocamidopropyl)\b/],
  ['cationic', 'Cationic surfactant / quat', /\b(benzalkonium|quaternium|didecyldimonium|cetrimonium|esterquat|ammonium chloride|quat)\b/],
  ['nonionic', 'Nonionic surfactant', /\b(ethoxylate|laureth \d|pareth|alcohol ethoxyl|glucoside|polyglucoside|\bapg\b|sorbitan|polysorbate|nonionic|eo po|poloxamer|plurafac|cocamide|glucamide|sucrose ester)\b/],
  ['biosurfactant', 'Biosurfactant', /\b(sophorolipid|rhamnolipid|mannosylerythritol|biosurfactant)\b/],
  ['builder', 'Builder / chelant', /\b(carbonate|bicarbonate|citrate|citric acid|zeolite|silicate|disilicate|metasilicate|phosphate|tripolyphosphate|stpp|mgda|methylglycinediacetic|glda|glutamic acid diacetic|edta|edds|hedp|phosphonate|gluconate|chelat|builder|sequest|iminodisuccinate|ids)\b/],
  ['polymer', 'Polymer (anti-redeposition, soil release, dye transfer)', /\b(carboxymethylcellulose|\bcmc\b|polyacrylate|acrylic|maleic|copolymer|polyvinylpyrrolidone|\bpvp\b|pvno|polyethyleneimine|soil release|polycarboxylate|sulfonated polymer)\b/],
  ['disintegrant', 'Disintegrant / binder', /\b(microcrystalline cellulose|croscarmellose|crospovidone|sodium starch glycolate|disintegr|binder|peg \d{3,4}|polyethylene glycol)\b/],
  ['solvent', 'Solvent', /\b(ethanol|isopropanol|propylene glycol|glycol ether|butoxyethanol|dipropylene glycol|methoxy|limonene|solvent)\b/],
  ['acid', 'Acid / pH adjuster', /\b(lactic acid|sulfamic|acetic acid|malic|hydrochloric|ph adjust)\b/],
  ['alkali', 'Alkali / pH adjuster', /\b(sodium hydroxide|potassium hydroxide|monoethanolamine|\bmea\b|triethanolamine|\btea\b)\b/],
  ['brightener', 'Optical brightener', /\b(brightener|stilbene|distyrylbiphenyl|fluorescent)\b/],
  ['fragrance', 'Fragrance', /\b(fragrance|parfum|perfume|essential oil|scent)\b/],
  ['preservative', 'Preservative', /\b(isothiazolinone|benzisothiazolinone|\bmit\b|\bbit\b|phenoxyethanol|benzoate|sorbate|preserv|dmdm|bronopol)\b/],
  ['colorant', 'Colourant', /\b(colorant|colourant|dye|pigment|ci \d{5}|blue \d|ultramarine)\b/],
  ['filler', 'Filler / process aid', /\b(sodium sulfate|sodium sulphate|sodium chloride|filler|starch|silica|talc|kaolin|water|aqua)\b/],
];
function classify(item) {
  const text = norm([item.ingredient_name, item.inci_name, item.function_in_formula].filter(Boolean).join(' | '));
  for (const [key, label, re] of CLASSES) if (re.test(text)) return { key, label };
  return { key: 'other', label: 'Other / unclassified' };
}

// ───────────────────────── watchlist (regulatory + claim conflicts) ─────────────────────────
// A screening aid, not legal advice: rules change, so every hit says to confirm current status.
const WATCHLIST = [
  { id: 'phosphate', re: /\b(phosphate|tripolyphosphate|stpp|pyrophosphate)\b/, concern: 'Phosphates: banned or capped in consumer laundry and automatic dishwashing in most US states (0.5% P limits) and capped in the EU (laundry since 2013, automatic dish since 2017). Conflicts with "phosphate-free" claims.', markets: ['US', 'EU'] },
  { id: 'npe', re: /\b(nonylphenol|octylphenol|alkylphenol|npe|ape)\b/, concern: 'Alkylphenol ethoxylates: endocrine-active degradation products; restricted in the EU and prohibited by EPA Safer Choice.', markets: ['EU', 'US'] },
  { id: 'dioxane', re: /\b(laureth|pareth|ethoxylat|\bsles\b|\baes\b|polysorbate|peg \d|peg\d|polyethylene glycol|ceteareth|eo po|poloxamer)\b/, concern: 'Ethoxylated ingredient: can carry 1,4-dioxane from manufacture. New York caps 1,4-dioxane in household cleaning products (1 ppm). Ask suppliers for a low-dioxane grade and a CoA with a test result. Also conflicts with "no 1,4-dioxane" brand claims unless tested.', markets: ['US-NY'] },
  { id: 'edta', re: /\b(edta|ethylenediaminetetraacetic|tetrasodium edta)\b/, concern: 'EDTA: poorly biodegradable and excluded by several eco standards (e.g. EU Ecolabel detergent criteria). MGDA, GLDA or citrate are the usual replacements.', markets: ['EU'] },
  { id: 'nta', re: /\b(nitrilotriacetic|\bnta\b)\b/, concern: 'NTA: classified as a suspected carcinogen in the EU; avoid for eco positioning.', markets: ['EU'] },
  { id: 'brightener', re: /\b(optical brightener|fluorescent brightener|stilbene|distyrylbiphenyl)\b/, concern: 'Optical brightener: conflicts with "no optical brighteners" claims and some eco-label criteria; poorly biodegradable.', markets: ['claims'] },
  { id: 'isothiazolinone', re: /\b(isothiazolinone|\bmit\b|\bcmit\b|\bbit\b|\boit\b|kathon)\b/, concern: 'Isothiazolinone preservative: skin sensitiser. Under EU CLP, MIT makes a mixture a classified skin sensitiser from 15 ppm, and the EUH208 allergy warning applies from about 1.5 ppm. Conflicts with "hypoallergenic" or "no harsh preservatives" positioning.', markets: ['EU', 'claims'] },
  { id: 'formaldehyde', re: /\b(formaldehyde|formalin|dmdm hydantoin|bronopol|imidazolidinyl urea|diazolidinyl urea|quaternium 15|methenamine)\b/, concern: 'Formaldehyde or a formaldehyde releaser: carcinogen classification; prohibited by EPA Safer Choice and most eco standards.', markets: ['EU', 'US'] },
  { id: 'boron', re: /\b(boric acid|borax|perborate|tetraborate|sodium borate)\b/, concern: 'Boron compound: EU reproductive toxicant (Repr. 1B) and SVHC; classification and restrictions apply in mixtures. Borate is also a common enzyme stabiliser in liquids, so check alternatives (calcium, formate, polyols).', markets: ['EU'] },
  { id: 'triclosan', re: /\b(triclosan|triclocarban)\b/, concern: 'Triclosan/triclocarban: restricted or banned in many markets; avoid.', markets: ['US', 'EU'] },
  { id: 'quat', re: /\b(benzalkonium|didecyldimonium|didecyldimethylammonium|alkyl dimethyl benzyl ammonium|quaternary ammonium)\b/, concern: 'Quaternary ammonium biocide: any antimicrobial or disinfecting claim needs EPA (FIFRA) registration in the US and biocide authorisation in the EU. Aquatic toxicity; incompatible with anionic surfactants.', markets: ['US', 'EU'] },
  { id: 'hypochlorite', re: /\b(hypochlorite|chlorine bleach)\b/, concern: 'Hypochlorite: never combine with acids or ammonia (toxic gas). Corrosive labelling; degrades enzymes, fragrance and dyes.', markets: ['safety'] },
  { id: 'pfas', re: /\b(perfluoro|polyfluoro|fluorosurfactant|ptfe|fluorotelomer|pfas|pfoa|pfos)\b/, concern: 'PFAS: intentionally added PFAS in cleaning products is already banned in some US states (e.g. Minnesota from 2025) with more following; EU restriction proposals pending.', markets: ['US', 'EU'] },
  { id: 'microplastic', re: /\b(microbead|polyethylene|polypropylene|melamine|microcapsule|encapsulat|polystyrene|acrylates copolymer)\b/, concern: 'Possible synthetic polymer microparticle: EU microplastics restriction (2023/2055) covers intentionally added microplastics, with transition periods for e.g. fragrance encapsulates. Check particle form and solubility with the supplier.', markets: ['EU'] },
  { id: 'pva', re: /\b(polyvinyl alcohol|pvoh|\bpva\b)\b/, concern: 'PVA/PVOH: water-soluble so generally outside the EU microplastics restriction, but its real-world biodegradation is publicly contested. Keep claims to what OECD 301/302 data for your exact grade supports.', markets: ['claims'] },
  { id: 'fragrance_allergen', re: /\b(limonene|linalool|citral|geraniol|eugenol|coumarin|citronellol|hexyl cinnamal|benzyl alcohol|benzyl salicylate|cinnamal|isoeugenol|lilial|butylphenyl methylpropional|hydroxycitronellal|farnesol|amyl cinnamal)\b/, concern: 'Listed fragrance allergen: EU detergent labelling applies above 0.01% (100 ppm) and the list was recently expanded. Lilial (butylphenyl methylpropional) is a reproductive toxicant (Repr. 1B), banned in EU cosmetics and restricted in consumer mixtures.', markets: ['EU'] },
  { id: 'enzyme', re: /\b(protease|subtilisin|amylase|lipase|cellulase|mannanase|enzyme)\b/, concern: 'Enzyme: respiratory sensitiser (H334). EU/CLP labelling ("contains enzymes...") and manufacturing dust control (industry guidance targets ~60 ng/m³ for protease). Use encapsulated/granulated grades in powders and tablets.', markets: ['EU', 'safety'] },
  { id: 'oxidiser', re: /\b(percarbonate|perborate|peroxide)\b/, concern: 'Peroxygen bleach: oxidiser (H272) for storage and transport; moisture-sensitive, which affects sheet and tablet shelf life and packaging.', markets: ['safety'] },
  { id: 'caustic', re: /\b(sodium hydroxide|potassium hydroxide|metasilicate)\b/, concern: 'Strong alkali: corrosive or irritant classification depends on concentration, pH and alkaline reserve. Matters for labelling, child-safety packaging and "gentle" claims.', markets: ['safety'] },
  { id: 'dye', re: /\b(colorant|colourant|\bdye\b|ci \d{5}|fd c)\b/, concern: 'Synthetic colourant: conflicts with "no dyes" claims.', markets: ['claims'] },
];
function screenIngredients(items, libraryFlags = {}) {
  const hits = [];
  for (const it of items) {
    const text = norm([it.ingredient_name, it.inci_name, it.cas_number].filter(Boolean).join(' '));
    const found = WATCHLIST.filter((w) => w.re.test(text)).map((w) => ({ id: w.id, concern: w.concern, markets: w.markets }));
    const lib = libraryFlags[it.ingredient_id] || libraryFlags[norm(it.ingredient_name)];
    if (lib && Object.keys(lib).length) found.push({ id: 'library_flag', concern: `Flag in your ingredient library: ${JSON.stringify(lib)}`, markets: [] });
    if (found.length) hits.push({ ingredient: it.ingredient_name, pct: it.pct ?? null, flags: found });
  }
  return { hits, note: 'Screening aid only. Regulations change: confirm current status with the regulator, the supplier SDS, or counsel before relying on it.' };
}

// ───────────────────────── formulation analysis ─────────────────────────
// items: [{ ingredient_id, ingredient_name, inci_name, quantity, unit, function_in_formula, phase }]
// prices: { [ingredient_id or normalised name]: { price_per_kg, currency, supplier, source } }
function analyzeFormula(items, { prices = {}, overrides = {}, unitWeightG = null, batchSize = null, batchUnit = null } = {}) {
  const rows = (items || []).map((it) => ({ ...it, q: num(it.quantity), u: String(it.unit || '%').trim() }));
  const pctMode = rows.every((r) => r.u === '%' || /w\/w|percent/i.test(r.u));
  let total = 0; const issues = [];
  if (pctMode) total = rows.reduce((s, r) => s + (r.q || 0), 0);
  else {
    // convert masses to grams, then to %
    for (const r of rows) { r.g = massToGrams(r.q, r.u); if (r.g == null) issues.push(`"${r.ingredient_name}" uses unit "${r.u}", which is not a mass or %; left out of the totals.`); }
    total = rows.reduce((s, r) => s + (r.g || 0), 0);
  }
  for (const r of rows) r.pct = pctMode ? r.q : (r.g != null && total ? (r.g / total) * 100 : null);
  if (pctMode && Math.abs(total - 100) > 0.5) issues.push(`Percentages add to ${round(total, 3)}%, not 100%. ${total < 100 ? 'Something is missing (often water, filler or a balance ingredient).' : 'Something is double-counted or over-dosed.'}`);
  const seen = new Map();
  for (const r of rows) {
    if (r.q == null || r.q <= 0) issues.push(`"${r.ingredient_name}" has no quantity.`);
    if (!r.function_in_formula) issues.push(`"${r.ingredient_name}" has no function recorded.`);
    const k = norm(r.ingredient_name); if (seen.has(k)) issues.push(`"${r.ingredient_name}" appears more than once.`); seen.set(k, true);
  }
  // class totals
  const classes = {};
  for (const r of rows) { const c = classify(r); r.cls = c; const o = (classes[c.key] = classes[c.key] || { label: c.label, pct: 0, items: [] }); o.pct += r.pct || 0; o.items.push(r.ingredient_name); }
  for (const c of Object.values(classes)) c.pct = round(c.pct, 3);
  const surf = ['anionic', 'nonionic', 'amphoteric', 'cationic', 'biosurfactant'].reduce((s, k) => s + (classes[k]?.pct || 0), 0);
  if (classes.cationic && classes.anionic) issues.push('Contains both cationic and anionic surfactants. They can form insoluble complexes; confirm compatibility and the ratio.');
  if (classes.bleach && classes.enzyme) issues.push('Bleach and enzymes together: fine in dry formats with separate, coated particles; a stability risk in liquids or high-moisture sheets.');

  // cost
  let costPerKg = 0; const missing = []; const costLines = []; const currencies = new Set();
  for (const r of rows) {
    const key = r.ingredient_id && prices[r.ingredient_id] ? r.ingredient_id : norm(r.ingredient_name);
    const ov = overrides[r.ingredient_name] ?? overrides[norm(r.ingredient_name)];
    const p = ov != null ? { price_per_kg: num(ov), currency: 'assumed', supplier: 'what-if price', source: 'override' } : prices[key];
    if (!p || p.price_per_kg == null || r.pct == null) { missing.push(r.ingredient_name); continue; }
    if (p.currency && p.currency !== 'assumed') currencies.add(p.currency);
    const contrib = (r.pct / 100) * p.price_per_kg; costPerKg += contrib;
    costLines.push({ ingredient: r.ingredient_name, pct: round(r.pct, 3), price_per_kg: round(p.price_per_kg, 4), cost_per_kg_finished: round(contrib, 4), supplier: p.supplier || null, price_source: p.source || null });
  }
  costLines.sort((a, b) => b.cost_per_kg_finished - a.cost_per_kg_finished);
  const costTotal = costPerKg ? costLines.reduce((s, l) => s + l.cost_per_kg_finished, 0) : 0;
  for (const l of costLines) l.share_of_cost_pct = costTotal ? round((l.cost_per_kg_finished / costTotal) * 100, 1) : null;
  const unitKg = unitWeightG ? unitWeightG / 1000 : null;
  return {
    basis: pctMode ? '% w/w as entered' : 'converted from batch masses to % w/w',
    total_pct: round(pctMode ? total : 100, 3),
    total_batch_g: pctMode ? null : round(total, 3),
    checks: issues,
    class_totals: classes,
    total_surfactant_pct: round(surf, 3),
    items: rows.map((r) => ({ ingredient: r.ingredient_name, pct: round(r.pct, 3), class: r.cls.label, function: r.function_in_formula || null, phase: r.phase || null })),
    cost: {
      raw_material_cost_per_kg: costLines.length ? round(costPerKg, 4) : null,
      raw_material_cost_per_unit: costLines.length && unitKg ? round(costPerKg * unitKg, 4) : null,
      unit_weight_g: unitWeightG || null,
      complete: missing.length === 0,
      priced_pct_of_formula: round(rows.filter((r) => !missing.includes(r.ingredient_name)).reduce((s, r) => s + (r.pct || 0), 0), 2),
      missing_prices: missing,
      currencies: [...currencies],
      lines: costLines,
      note: missing.length ? 'Cost is partial: ingredients without a price are excluded, so the true cost is higher.' : (currencies.size > 1 ? 'Prices are in more than one currency; convert before comparing.' : undefined),
    },
    batch: batchSize ? { size: batchSize, unit: batchUnit || 'g', amounts_g: (() => { const g = massToGrams(batchSize, batchUnit || 'g'); return g ? rows.map((r) => ({ ingredient: r.ingredient_name, grams: round((r.pct || 0) / 100 * g, 3) })) : null; })() } : undefined,
  };
}

function compareFormulas(a, b) {
  const map = (items) => new Map((items || []).map((i) => [norm(i.ingredient_name), i]));
  const A = map(a), B = map(b); const out = { added: [], removed: [], changed: [], unchanged: 0 };
  for (const [k, i] of B) { if (!A.has(k)) out.added.push({ ingredient: i.ingredient_name, pct: num(i.quantity) }); }
  for (const [k, i] of A) {
    if (!B.has(k)) { out.removed.push({ ingredient: i.ingredient_name, pct: num(i.quantity) }); continue; }
    const j = B.get(k); const d = (num(j.quantity) || 0) - (num(i.quantity) || 0);
    if (Math.abs(d) > 1e-9) out.changed.push({ ingredient: i.ingredient_name, from: num(i.quantity), to: num(j.quantity), delta: round(d, 4) }); else out.unchanged++;
  }
  out.changed.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return out;
}

// ───────────────────────── pricing tiers + landed cost ─────────────────────────
const tierQty = (t) => num(t.min_qty ?? t.volume ?? t.qty ?? t.quantity ?? t.min);
const tierPrice = (t) => num(t.unit_price ?? t.price ?? t.price_per_unit);
function priceAtVolume(tiers, volume, fallback = null) {
  const list = (tiers || []).map((t) => ({ q: tierQty(t), p: tierPrice(t) })).filter((t) => t.p != null);
  if (!list.length || volume == null) return { price: fallback, tier: null };
  const ok = list.filter((t) => t.q == null || t.q <= volume).sort((a, b) => (b.q || 0) - (a.q || 0));
  if (ok.length) return { price: ok[0].p, tier: ok[0].q };
  const lowest = list.sort((a, b) => (a.q || 0) - (b.q || 0))[0];
  return { price: fallback ?? lowest.p, tier: lowest.q, below_first_tier: true };
}
// quotes: [{ name, currency, base_unit_price, volume_tiers, moq, lead_time_days, fob, location, certifications }]
function landedCost(quotes, { volume, freight_per_unit = 0, duty_pct = 0, other_per_unit = 0, fx = {}, target_currency = 'USD', target_unit_price = null } = {}) {
  const rows = (quotes || []).map((q) => {
    const at = priceAtVolume(q.volume_tiers, volume, num(q.base_unit_price));
    const notes = [];
    if (at.price == null) return { name: q.name, error: 'no unit price quoted' };
    const cur = q.currency || target_currency; let rate = 1;
    if (cur !== target_currency) { rate = num(fx[cur]); if (rate == null) { notes.push(`Quoted in ${cur}; no exchange rate given, so not converted.`); rate = 1; } }
    if (at.below_first_tier) notes.push('Volume is below the first price tier; used the base or lowest-tier price.');
    if (q.moq != null && volume != null && num(q.moq) > volume) notes.push(`MOQ ${q.moq} is above the volume being compared (${volume}).`);
    const price = at.price * rate; const duty = price * (num(duty_pct) || 0) / 100;
    const fr = num(q.freight_per_unit ?? freight_per_unit) || 0; const ot = num(other_per_unit) || 0;
    const landed = price + duty + fr + ot;
    return { name: q.name, location: q.location || null, fob: q.fob || null, quoted_currency: cur, unit_price: round(price, 4), tier_min_qty: at.tier, duty: round(duty, 4), freight: round(fr, 4), other: round(ot, 4), landed_unit_cost: round(landed, 4), total_at_volume: volume ? round(landed * volume, 2) : null, vs_target_pct: target_unit_price ? round(((landed - target_unit_price) / target_unit_price) * 100, 1) : null, lead_time_days: q.lead_time_days ?? null, moq: q.moq ?? null, certifications: q.certifications || [], notes };
  });
  const ranked = rows.filter((r) => r.landed_unit_cost != null).sort((a, b) => a.landed_unit_cost - b.landed_unit_cost);
  return { volume, target_currency, assumptions: { freight_per_unit, duty_pct, other_per_unit, fx }, ranked, errors: rows.filter((r) => r.error) };
}

// ───────────────────────── design of experiments ─────────────────────────
// factors: [{ name, low, high, levels?: [...], center? }]  (mixture: [{ name, min, max }])
function levelsOf(f, n = 2) {
  if (Array.isArray(f.levels) && f.levels.length) return f.levels;
  const lo = num(f.low), hi = num(f.high);
  if (lo == null || hi == null) return n === 3 ? ['low', 'mid', 'high'] : ['low', 'high'];
  return n === 3 ? [lo, round((lo + hi) / 2, 6), hi] : [lo, hi];
}
const coded = (f, c) => { const lv = levelsOf(f, 3); return c === -1 ? lv[0] : c === 1 ? lv[2] : lv[1]; };
function cartesian(arrs) { return arrs.reduce((acc, a) => acc.flatMap((x) => a.map((y) => [...x, y])), [[]]); }
function fullFactorial(factors) { return cartesian(factors.map((f) => levelsOf(f))).map((vals) => Object.fromEntries(factors.map((f, i) => [f.name, vals[i]]))); }
function fractionalFactorial(factors) {
  const k = factors.length; if (k < 3) return { rows: fullFactorial(factors), note: 'Fewer than 3 factors: used a full factorial.' };
  const base = cartesian(Array.from({ length: k - 1 }, () => [-1, 1]));
  const rows = base.map((s) => { const last = s.reduce((p, v) => p * v, 1); return [...s, last]; });
  const resolution = k; // half fraction with generator = product of all others
  return { rows: rows.map((s) => Object.fromEntries(factors.map((f, i) => [f.name, coded(f, s[i])]))), note: `Half fraction 2^(${k}-1), ${rows.length} runs, resolution ${['', '', '', 'III', 'IV', 'V', 'VI', 'VII'][Math.min(resolution, 7)] || resolution}. Generator: ${factors[k - 1].name} = product of the others.` };
}
const PB_GEN = { 8: [1, 1, 1, -1, 1, -1, -1], 12: [1, 1, -1, 1, 1, 1, -1, -1, -1, 1, -1] };
function plackettBurman(factors) {
  const k = factors.length; const n = k <= 7 ? 8 : k <= 11 ? 12 : null;
  if (!n) return { rows: [], note: 'Plackett-Burman here supports up to 11 factors.' };
  const g = PB_GEN[n]; const rows = [];
  for (let i = 0; i < n - 1; i++) rows.push(Array.from({ length: n - 1 }, (_, j) => g[(j - i + (n - 1)) % (n - 1)]));
  rows.push(Array(n - 1).fill(-1));
  return { rows: rows.map((s) => Object.fromEntries(factors.map((f, i) => [f.name, coded(f, s[i])]))), note: `Plackett-Burman screening design, ${n} runs. Main effects only; effects are aliased with two-factor interactions.` };
}
function boxBehnken(factors, centers = 3) {
  const k = factors.length; if (k < 3) return { rows: [], note: 'Box-Behnken needs at least 3 factors.' };
  const rows = [];
  for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) for (const sa of [-1, 1]) for (const sb of [-1, 1]) { const s = Array(k).fill(0); s[a] = sa; s[b] = sb; rows.push(s); }
  for (let c = 0; c < centers; c++) rows.push(Array(k).fill(0));
  return { rows: rows.map((s) => Object.fromEntries(factors.map((f, i) => [f.name, coded(f, s[i])]))), note: `Box-Behnken, ${rows.length} runs incl. ${centers} centre points. Fits a quadratic model without extreme corner runs.` };
}
function centralComposite(factors, centers = 3) {
  const k = factors.length; const rows = cartesian(Array.from({ length: k }, () => [-1, 1]));
  for (let i = 0; i < k; i++) for (const s of [-1, 1]) { const r = Array(k).fill(0); r[i] = s; rows.push(r); }
  for (let c = 0; c < centers; c++) rows.push(Array(k).fill(0));
  return { rows: rows.map((s) => Object.fromEntries(factors.map((f, i) => [f.name, coded(f, s[i])]))), note: `Face-centred central composite, ${rows.length} runs incl. ${centers} centre points. Fits a quadratic model.` };
}
// Simplex-lattice {q, m} in L-pseudo-components (respects lower bounds; drops points over an upper bound)
function simplexLattice(components, degree = 2, total = 100) {
  const q = components.length; const m = Math.max(1, Math.min(4, Math.round(degree)));
  const L = components.map((c) => num(c.min) || 0); const sumL = L.reduce((s, x) => s + x, 0);
  if (sumL >= total) return { rows: [], note: 'Lower bounds already add to the total; nothing left to vary.' };
  const pts = []; const rec = (i, left, acc) => { if (i === q - 1) { pts.push([...acc, left]); return; } for (let v = 0; v <= left; v++) rec(i + 1, left - v, [...acc, v]); };
  rec(0, m, []);
  const rows = []; const dropped = [];
  for (const p of pts) {
    const vals = p.map((v, i) => round(L[i] + (total - sumL) * (v / m), 4));
    const over = components.findIndex((c, i) => num(c.max) != null && vals[i] > num(c.max) + 1e-9);
    const row = Object.fromEntries(components.map((c, i) => [c.name, vals[i]]));
    if (over >= 0) dropped.push(row); else rows.push(row);
  }
  // overall centroid as an extra check point
  rows.push(Object.fromEntries(components.map((c, i) => [c.name, round(L[i] + (total - sumL) / q, 4)])));
  return { rows, note: `Simplex-lattice {${q},${m}} mixture design on the varied part (${round(total - sumL, 3)} of ${total}), plus the centroid. ${dropped.length ? dropped.length + ' point(s) dropped for exceeding an upper bound; consider a D-optimal design for tight constraints.' : ''}`.trim() };
}
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function designExperiment({ design, factors = [], components = [], degree = 2, total = 100, center_points = 3, replicates = 1, randomize = true, seed = 7 }) {
  let res;
  switch (design) {
    case 'full_factorial': res = { rows: fullFactorial(factors), note: `Full factorial, every combination of ${factors.length} factor(s).` }; break;
    case 'fractional_factorial': res = fractionalFactorial(factors); break;
    case 'plackett_burman': res = plackettBurman(factors); break;
    case 'box_behnken': res = boxBehnken(factors, center_points); break;
    case 'central_composite': res = centralComposite(factors, center_points); break;
    case 'simplex_lattice': case 'mixture': res = simplexLattice(components.length ? components : factors, degree, total); break;
    default: return { error: `unknown design ${design}` };
  }
  let rows = [];
  for (let r = 0; r < Math.max(1, replicates); r++) rows = rows.concat(res.rows.map((x, i) => ({ std_order: i + 1, replicate: r + 1, settings: x })));
  let order = rows.map((_, i) => i);
  if (randomize) { const rnd = mulberry(seed); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } }
  return { design, runs: order.map((i, n) => ({ run: n + 1, ...rows[i] })), run_count: rows.length, note: res.note + (randomize ? ' Run order randomised.' : '') };
}

// ───────────────────────── experiment analysis ─────────────────────────
// runs: [{ factor_settings: {f: v}, response_results: {r: v} }]
function analyzeRuns(runs) {
  const done = (runs || []).filter((r) => r.response_results && Object.keys(r.response_results).length);
  if (!done.length) return { runs_with_results: 0, note: 'No runs have recorded results yet.' };
  const factors = [...new Set(done.flatMap((r) => Object.keys(r.factor_settings || {})))];
  const responses = [...new Set(done.flatMap((r) => Object.keys(r.response_results || {})))].filter((k) => done.some((r) => num(r.response_results[k]) != null));
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const out = {};
  for (const resp of responses) {
    const vals = done.map((r) => num(r.response_results[resp])).filter((v) => v != null);
    const sd = (() => { const m = mean(vals); return vals.length > 1 ? Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / (vals.length - 1)) : null; })();
    const effects = factors.map((f) => {
      const groups = new Map();
      for (const r of done) { const v = num(r.response_results[resp]); if (v == null) continue; const lv = r.factor_settings?.[f]; const key = lv === undefined ? '(not set)' : String(lv); (groups.get(key) || groups.set(key, []).get(key)).push(v); }
      const levels = [...groups].map(([lv, a]) => ({ level: lv, n: a.length, mean: round(mean(a), 4) }));
      const numericLv = levels.every((l) => num(l.level) != null); if (numericLv) levels.sort((a, b) => num(a.level) - num(b.level));
      const means = levels.map((l) => l.mean); const range = means.length > 1 ? Math.max(...means) - Math.min(...means) : 0;
      const effect = numericLv && levels.length >= 2 ? levels[levels.length - 1].mean - levels[0].mean : null;
      return { factor: f, levels, effect_low_to_high: round(effect, 4), range_of_means: round(range, 4) };
    }).sort((a, b) => b.range_of_means - a.range_of_means);
    out[resp] = { n: vals.length, mean: round(mean(vals), 4), min: round(Math.min(...vals), 4), max: round(Math.max(...vals), 4), sd: round(sd, 4), factors_ranked: effects };
  }
  return { runs_with_results: done.length, responses: out, note: 'Main-effect screening (difference of level means). With few runs, treat effects smaller than about 2x the run-to-run SD as noise and confirm with replicates.' };
}

// ───────────────────────── tests ─────────────────────────
function summarizeTests(tests) {
  const rows = (tests || []).map((t) => {
    const v = num(t.result_value); const lo = num(t.spec_min), hi = num(t.spec_max);
    let computed = null; if (v != null && (lo != null || hi != null)) computed = (lo == null || v >= lo) && (hi == null || v <= hi) ? 'pass' : 'fail';
    return { test: t.test_name, category: t.test_category || null, method: t.test_method || null, condition: [t.storage_condition, t.time_point].filter(Boolean).join(' @ ') || null, result: v ?? t.result_text ?? null, unit: t.result_unit || null, spec: t.specification || (lo != null || hi != null ? `${lo ?? ''}–${hi ?? ''}` : null), status: t.status || computed || 'unknown', status_mismatch: t.status && computed && t.status !== computed ? `recorded ${t.status}, but the value is ${computed === 'pass' ? 'inside' : 'outside'} spec` : undefined, date: t.tested_date || t.reported_date || null, formulation_id: t.formulation_id || null, lab: t.test_lab || null };
  });
  const by = (s) => rows.filter((r) => r.status === s).length;
  return { total: rows.length, pass: by('pass'), fail: by('fail'), pending: rows.length - by('pass') - by('fail'), failing: rows.filter((r) => r.status === 'fail'), rows };
}

module.exports = { round, num, norm, kgPer, pricePerKg, massToGrams, classify, CLASSES, WATCHLIST, screenIngredients, analyzeFormula, compareFormulas, priceAtVolume, landedCost, designExperiment, fullFactorial, fractionalFactorial, plackettBurman, boxBehnken, centralComposite, simplexLattice, analyzeRuns, summarizeTests };
