"use client";
// Home dashboard: product units ordered on one day (yesterday by default),
// by product line (L-06-LS, L-09-LS, ...), with bundles and multi-packs broken
// into the products they contain. Tick lines to see their combined total;
// click a line for its SKUs that day. Step back a day with the arrows.
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

const DAY = 864e5;
const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
const fmtN = (n) => (n == null || !isFinite(n) ? "-" : Math.round(n).toLocaleString());
const fmtPct = (p) => (p == null || !isFinite(p) ? "" : `${p >= 0 ? "▲" : "▼"} ${Math.abs(p * 100).toFixed(1)}%`);
const fmtDay = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const localToday = () => new Date().toLocaleDateString("en-CA");
const LS_KEY = "helm.home.yesterdayUnits.lines";

export default function YesterdayUnits({ setActive }) {
  const [rows, setRows] = useState(null);      // d, k (line), v over the last few weeks
  const [day, setDay] = useState(null);        // selected day (defaults to the latest with data)
  const [picked, setPicked] = useState(() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; } });
  const [open, setOpen] = useState(null);      // line expanded to SKUs
  const [skuRows, setSkuRows] = useState([]);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [channel, setChannel] = useState("all");          // all | shopify | amazon
  const [includeFree, setIncludeFree] = useState(false);  // free gifts (GWP) shipped with orders

  useEffect(() => {
    const to = addDays(localToday(), -1);
    supabase.rpc("dp_units_daily", { p_from: addDays(to, -45), p_to: to, p_group: "line", p_measure: "items", p_include_free: includeFree, p_top: 8, p_channels: channel === "all" ? null : [channel] })
      .then(({ data, error: e }) => {
        if (e) { setError(e.message); setRows([]); return; }
        setRows(data || []);
        const last = (data || []).reduce((m, r) => (r.d > m ? r.d : m), "");
        setDay((d) => d || last || to);
      });
  }, [channel, includeFree]);
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(picked)); } catch { /* ignore */ } }, [picked]);

  useEffect(() => {
    if (!open || !day) { setSkuRows([]); return; }
    supabase.rpc("dp_units_daily", { p_from: day, p_to: day, p_group: "sku", p_measure: "items", p_include_free: includeFree, p_top: 12, p_lines: [open], p_channels: channel === "all" ? null : [channel] })
      .then(({ data }) => setSkuRows((data || []).sort((a, b) => b.v - a.v)));
  }, [open, day, channel, includeFree]);

  const data = useMemo(() => {
    if (!rows || !day) return null;
    const by = (d) => { const m = {}; rows.filter((r) => r.d === d).forEach((r) => { m[r.k] = (m[r.k] || 0) + Number(r.v); }); return m; };
    const cur = by(day), prev = by(addDays(day, -1)), wk = by(addDays(day, -7));
    const lines = Object.keys({ ...cur, ...wk }).filter((k) => k !== "Other").sort((a, b) => (cur[b] || 0) - (cur[a] || 0));
    if (cur.Other || wk.Other) lines.push("Other");
    const total = (m, ks) => ks.reduce((s, k) => s + (m[k] || 0), 0);
    const all = Object.keys({ ...cur, ...prev, ...wk });
    const sel = picked.filter((k) => lines.includes(k));
    return { cur, prev, wk, lines, total: total(cur, all), totalPrev: total(prev, all), totalWk: total(wk, all), sel,
      selCur: total(cur, sel), selWk: total(wk, sel), first: rows.reduce((m, r) => (r.d < m ? r.d : m), day), last: rows.reduce((m, r) => (r.d > m ? r.d : m), "") };
  }, [rows, day, picked]);

  const isYesterday = day === addDays(localToday(), -1);
  const box = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, marginBottom: 24 };
  const arrow = (dis) => ({ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: dis ? T.text3 : T.text, cursor: dis ? "default" : "pointer", fontSize: 13 });
  const delta = (a, b) => (b ? a / b - 1 : null);
  const dColor = (p) => (p == null ? T.text3 : p >= 0 ? T.green : T.red);

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>📦 Units ordered {isYesterday ? "yesterday" : ""}</div>
        {day && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button aria-label="Previous day" disabled={!data || day <= data.first} onClick={() => setDay(addDays(day, -1))} style={arrow(!data || day <= data.first)}>‹</button>
            <span style={{ fontSize: 12.5, color: T.text2, minWidth: 110, textAlign: "center" }}>{fmtDay(day)}</span>
            <button aria-label="Next day" disabled={!data || day >= data.last} onClick={() => setDay(addDays(day, 1))} style={arrow(!data || day >= data.last)}>›</button>
          </div>
        )}
        <div style={{ display: "inline-flex", border: `1px solid ${T.border}`, borderRadius: 7, overflow: "hidden" }}>
          {[["all", "All channels"], ["shopify", "Shopify"], ["amazon", "Amazon"]].map(([k, l]) => (
            <button key={k} onClick={() => setChannel(k)} style={{ padding: "4px 9px", fontSize: 11.5, fontWeight: 600, border: "none", cursor: "pointer", background: channel === k ? T.accent : T.surface2, color: channel === k ? "#fff" : T.text2 }}>{l}</button>
          ))}
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: T.text2, cursor: "pointer" }}>
          <input type="checkbox" checked={includeFree} onChange={(e) => setIncludeFree(e.target.checked)} /> Include free gifts
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={() => { try { localStorage.setItem("helm_dp_tab", "units"); } catch { /* ignore */ } setActive("erp", "demand_planning"); }}
          style={{ background: "none", border: "none", color: T.accent, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Daily Units →</button>
      </div>
      {error && <div style={{ color: T.red, fontSize: 12 }}>{error}</div>}
      {!data ? <div style={{ color: T.text3, fontSize: 12.5, padding: "10px 0" }}>{rows ? "No orders in the last few weeks." : "Loading…"}</div> : (
        <>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>All products</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtN(data.total)}</div>
              <div style={{ fontSize: 11.5, color: T.text2 }}>
                <span style={{ color: dColor(delta(data.total, data.totalWk)), fontWeight: 700 }}>{fmtPct(delta(data.total, data.totalWk))}</span> vs same day last week ({fmtN(data.totalWk)})
              </div>
            </div>
            {data.sel.length > 0 && (
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Selected: {data.sel.join(" + ")}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: T.accent, fontVariantNumeric: "tabular-nums" }}>{fmtN(data.selCur)}</div>
                <div style={{ fontSize: 11.5, color: T.text2 }}>
                  <span style={{ color: dColor(delta(data.selCur, data.selWk)), fontWeight: 700 }}>{fmtPct(delta(data.selCur, data.selWk))}</span> vs same day last week ({fmtN(data.selWk)})
                </div>
              </div>
            )}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: T.text3, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <th style={{ width: 28 }} />
                <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700 }}>Product line</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>{fmtDay(day)}</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>Day before</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>Same day last week</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>vs last week</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? data.lines : data.lines.filter((k, i) => i < 8 || picked.includes(k))).map((k) => {
                const on = picked.includes(k), d = delta(data.cur[k] || 0, data.wk[k]);
                return [
                  <tr key={k} style={{ borderTop: `1px solid ${T.border}`, background: open === k ? T.surface2 : "transparent" }}>
                    <td style={{ padding: "6px 4px", textAlign: "center" }}>
                      <input type="checkbox" checked={on} title="Add to the selected total" onChange={() => setPicked((p) => (on ? p.filter((x) => x !== k) : [...p, k]))} />
                    </td>
                    <td style={{ padding: "6px 8px", color: T.text, fontWeight: 600, cursor: k === "Other" ? "default" : "pointer" }} onClick={() => k !== "Other" && setOpen(open === k ? null : k)}>
                      {k !== "Other" && <span style={{ color: T.text3, marginRight: 6 }}>{open === k ? "▾" : "▸"}</span>}{k === "Other" ? "Other / not yet mapped" : k}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtN(data.cur[k] || 0)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: T.text2, fontVariantNumeric: "tabular-nums" }}>{fmtN(data.prev[k] || 0)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: T.text2, fontVariantNumeric: "tabular-nums" }}>{fmtN(data.wk[k] || 0)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: dColor(d), fontVariantNumeric: "tabular-nums" }}>{fmtPct(d)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: T.text3, fontVariantNumeric: "tabular-nums" }}>{data.total ? `${(((data.cur[k] || 0) / data.total) * 100).toFixed(0)}%` : ""}</td>
                  </tr>,
                  open === k && (
                    <tr key={k + "-skus"}>
                      <td />
                      <td colSpan={6} style={{ padding: "4px 8px 10px", background: T.surface2 }}>
                        {!skuRows.length ? <span style={{ fontSize: 12, color: T.text3 }}>Loading…</span> : skuRows.map((r) => (
                          <div key={r.k} style={{ display: "flex", gap: 10, fontSize: 12, color: T.text2, lineHeight: 1.7 }}>
                            <span style={{ fontWeight: 600, color: T.text, minWidth: 150 }}>{r.k}</span>
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label !== r.k ? r.label : ""}</span>
                            <span style={{ fontVariantNumeric: "tabular-nums", color: T.text }}>{fmtN(r.v)}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
          {data.lines.length > 8 && <button onClick={() => setShowAll((v) => !v)} style={{ marginTop: 6, fontSize: 11.5, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{showAll ? "Show fewer" : `Show all ${data.lines.length} lines`}</button>}
          <div style={{ fontSize: 11, color: T.text3, marginTop: 8 }}>Product units: bundles and multi-packs counted as the products inside them (a 3-pack = 3). {includeFree ? "Paid units plus free gifts" : "Paid units only (free gifts excluded)"}, {channel === "all" ? "Shopify + Amazon" : channel === "shopify" ? "Shopify only" : "Amazon only"}, by order date. Shipping and protection lines are never counted.</div>
        </>
      )}
    </div>
  );
}
