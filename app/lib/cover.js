// Inventory cover and reorder planning for Demand Planning > Inventory Cover.
//
// For one stock item in one region:
//   stock    units available now at the included locations
//   demand   daily forecast from today (index 0 = today)
//   arrivals open PO quantity by day index (from today)
// Projected stock P(t) = stock + arrivals up to t - demand up to t.
// Safety stock = safetyDays x average daily demand (next 30 days).
// Reorder-by = the day projected stock would fall below safety stock, minus
// the lead time: the last day an order placed now still lands in time.
// Suggested order = what an order placed on the reorder-by day needs so stock
// stays at or above safety stock for `targetDays` after it lands.
import { addDays } from "./forecast";

export const STATUS = {
  stockout: { label: "Out of stock", tone: "critical", icon: "⛔", rank: 0 },
  late:     { label: "Order now - late", tone: "critical", icon: "⛔", rank: 1 },
  now:      { label: "Order now", tone: "serious", icon: "▲", rank: 2 },
  soon:     { label: "Order soon", tone: "warning", icon: "◆", rank: 3 },
  ok:       { label: "OK", tone: "good", icon: "✓", rank: 4 },
  excess:   { label: "Excess", tone: "info", icon: "○", rank: 5 },
  idle:     { label: "No demand", tone: "muted", icon: "-", rank: 6 },
};

const roundUp = (q) => (q <= 0 ? 0 : q < 1000 ? Math.ceil(q / 50) * 50 : q < 20000 ? Math.ceil(q / 500) * 500 : Math.ceil(q / 1000) * 1000);

export function planItem({ stock, demand, arrivals, today, leadDays = 45, safetyDays = 14, targetDays = 60, soonDays = 14, excessDays = 365 }) {
  const H = demand.length;
  const s0 = Math.max(0, stock || 0);
  const avg30 = demand.slice(0, 30).reduce((s, x) => s + x, 0) / Math.min(30, Math.max(1, H));
  const safety = safetyDays * avg30;
  const proj = new Array(H);
  const projNoPo = new Array(H);
  let cumD = 0, cumA = 0, coverIdx = null, stockoutIdx = null, breachIdx = null;
  for (let t = 0; t < H; t++) {
    cumD += demand[t] || 0; cumA += arrivals[t] || 0;
    proj[t] = s0 + cumA - cumD;
    projNoPo[t] = s0 - cumD;
    if (coverIdx == null && projNoPo[t] <= 0) coverIdx = t;
    if (stockoutIdx == null && proj[t] <= 0) stockoutIdx = t;
    if (breachIdx == null && proj[t] < safety) breachIdx = t;
  }
  const reorderIdx = breachIdx == null ? null : breachIdx - leadDays;
  // Order placed on the reorder-by day (today if that has passed), landing a
  // lead time later and lasting `targetDays` beyond that.
  const end = Math.min(H - 1, Math.max(0, reorderIdx ?? 0) + leadDays + targetDays);
  let need = 0;
  if (reorderIdx != null && end >= 0) {
    let dSum = 0, aSum = 0;
    for (let t = 0; t <= end; t++) { dSum += demand[t] || 0; aSum += arrivals[t] || 0; }
    need = dSum + safety - (s0 + aSum);
  }
  let status;
  if (avg30 < 0.5) status = "idle";
  else if (s0 <= 0) status = "stockout";
  else if (stockoutIdx != null && stockoutIdx < leadDays) status = "late";
  else if (reorderIdx != null && reorderIdx <= 0) status = "now";
  else if (reorderIdx != null && reorderIdx <= soonDays) status = "soon";
  else if (coverIdx == null || coverIdx > excessDays) status = "excess";
  else status = "ok";
  const at = (i) => (i == null ? null : addDays(today, i));
  return {
    avgDaily: avg30, safety,
    coverDays: coverIdx, coverDate: at(coverIdx),          // stock on hand only
    stockoutDays: stockoutIdx, stockoutDate: at(stockoutIdx), // with open POs
    reorderDays: reorderIdx, reorderDate: reorderIdx == null ? null : at(Math.max(0, reorderIdx)),
    suggestQty: status === "idle" ? 0 : roundUp(need),
    status, proj, projNoPo,
  };
}

// Expected arrival of an open PO line. Lines without a required-by date are
// assumed to land one lead time after they were ordered. Lines more than
// `staleDays` overdue are treated as stale (not counted) unless countStale.
export function poArrival(po, { today, leadDays = 45, staleDays = 30, countStale = false }) {
  const expected = po.required_by || (po.order_date ? addDays(po.order_date, leadDays) : null);
  if (!expected) return { expected: null, arrive: today, overdue: false, stale: false, counted: true, assumed: true };
  const overdue = expected < today;
  const stale = overdue && expected < addDays(today, -staleDays);
  return { expected, arrive: overdue ? today : expected, overdue, stale, counted: !stale || countStale, assumed: !po.required_by };
}
