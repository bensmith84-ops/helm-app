"use client";

import { useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";

const EXAMPLES = [
  "What's the average postage cost for GWP 4-packs in Australia?",
  "Average US postage for orders with 5 main units",
  "Average postage to Canada for parcels between 0.75 and 1kg",
  "Show me UK postage cost per week over time",
  "Compare average postage by market",
];

const fmtCell = (v) => {
  if (v == null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(v);
};

// ── Minimal inline SVG chart (bar + line), no external deps ──────────────
function Chart({ spec, rows, T }) {
  if (!spec || spec.type === "none" || !Array.isArray(rows) || rows.length === 0) return null;
  const xKey = spec.x, yKey = spec.y;
  if (!xKey || !yKey || !(xKey in rows[0]) || !(yKey in rows[0])) return null;
  const data = rows.slice(0, 40).map((r) => ({ x: fmtCell(r[xKey]), y: Number(r[yKey]) || 0 }));
  const W = 720, H = 260, padL = 54, padR = 16, padT = 16, padB = 52;
  const iw = W - padL - padR, ih = H - padT - padB;
  const maxY = Math.max(...data.map((d) => d.y), 0) || 1;
  const yTicks = 4;
  const xStep = iw / data.length;
  const barW = Math.min(46, xStep * 0.62);
  const px = (i) => padL + xStep * i + xStep / 2;
  const py = (v) => padT + ih - (v / maxY) * ih;
  const showEvery = Math.ceil(data.length / 14);

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={W} height={H} style={{ maxWidth: "100%", height: "auto", display: "block" }}>
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const v = (maxY / yTicks) * i;
          const y = py(v);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={T.border} strokeWidth="1" opacity="0.5" />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill={T.text3}>{v >= 100 ? Math.round(v) : v.toFixed(1)}</text>
            </g>
          );
        })}
        {spec.type === "line" ? (
          <>
            <polyline fill="none" stroke={T.accent} strokeWidth="2.5"
              points={data.map((d, i) => `${px(i)},${py(d.y)}`).join(" ")} />
            {data.map((d, i) => <circle key={i} cx={px(i)} cy={py(d.y)} r="3" fill={T.accent} />)}
          </>
        ) : (
          data.map((d, i) => (
            <rect key={i} x={px(i) - barW / 2} y={py(d.y)} width={barW} height={Math.max(0, padT + ih - py(d.y))}
              rx="3" fill={T.accent} opacity="0.85" />
          ))
        )}
        {data.map((d, i) => (i % showEvery === 0) && (
          <text key={i} x={px(i)} y={H - padB + 16} textAnchor="middle" fontSize="10" fill={T.text3}
            transform={data.length > 8 ? `rotate(35 ${px(i)} ${H - padB + 16})` : undefined}>
            {d.x.length > 12 ? d.x.slice(0, 12) + "…" : d.x}
          </text>
        ))}
      </svg>
    </div>
  );
}

export default function ThreePLCostExplorer({ goBack }) {
  const { tokens: T } = useTheme();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const [showSql, setShowSql] = useState(false);
  const inputRef = useRef(null);

  const ask = async (question) => {
    const text = (question ?? q).trim();
    if (!text || loading) return;
    setQ(text); setLoading(true); setErr(null); setRes(null); setShowSql(false);
    try {
      const { data, error } = await supabase.functions.invoke("cost-explorer", { body: { question: text } });
      if (error) throw new Error(error.message || "Request failed");
      if (data?.error) { setErr(data.error); setRes({ sql: data.sql }); }
      else setRes(data);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const rows = res?.rows || [];
  const cols = rows.length ? Object.keys(rows[0]) : [];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "8px 4px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        {goBack && <button onClick={goBack} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 13 }}>← Back</button>}
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.text }}>Cost Explorer</h2>
        <span style={{ fontSize: 11, color: T.text3, background: T.surface2, padding: "2px 8px", borderRadius: 10 }}>🌏 US · UK · AU + intl</span>
      </div>
      <p style={{ fontSize: 13, color: T.text3, margin: "0 0 14px" }}>Ask about shipping/postage costs across all markets in plain English — US (USD), UK & international incl. Canada (GBP), and Australia (AUD). GWP/pack-size questions work for US & AU; the UK feed has no SKU link yet.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <textarea ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
          placeholder="e.g. What's the average postage for GWP 4-packs in Australia?"
          rows={1}
          style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 14, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.4, minHeight: 42 }} />
        <button onClick={() => ask()} disabled={loading || !q.trim()}
          style={{ padding: "0 18px", borderRadius: 10, border: "none", background: loading || !q.trim() ? T.surface3 : T.accent, color: loading || !q.trim() ? T.text3 : "#fff", fontWeight: 700, fontSize: 14, cursor: loading || !q.trim() ? "default" : "pointer" }}>
          {loading ? "…" : "Ask"}
        </button>
      </div>

      {!res && !loading && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => ask(ex)}
              style={{ padding: "6px 12px", borderRadius: 16, border: `1px solid ${T.border}`, background: T.surface, color: T.text2, fontSize: 12, cursor: "pointer" }}>{ex}</button>
          ))}
        </div>
      )}

      {loading && <div style={{ padding: 24, textAlign: "center", color: T.text3, fontSize: 14 }}>Thinking through your data…</div>}

      {err && (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: "#ef444415", border: "1px solid #ef444440", color: T.text2, fontSize: 13, marginBottom: 12 }}>
          <strong style={{ color: "#ef4444" }}>Couldn't answer that.</strong> {err}
          {res?.sql && <pre style={{ marginTop: 8, fontSize: 11, color: T.text3, whiteSpace: "pre-wrap" }}>{res.sql}</pre>}
        </div>
      )}

      {res && !err && (
        <div style={{ marginTop: 6 }}>
          {res.answer && (
            <div style={{ padding: "14px 16px", borderRadius: 12, background: T.accent + "12", border: `1px solid ${T.accent}30`, color: T.text, fontSize: 15, lineHeight: 1.5, marginBottom: 16 }}>
              {res.answer}
            </div>
          )}
          {res.chart && res.chart.type !== "none" && rows.length > 1 && (
            <div style={{ padding: "14px 16px 8px", borderRadius: 12, border: `1px solid ${T.border}`, background: T.surface, marginBottom: 16 }}>
              {res.chart.title && <div style={{ fontSize: 13, fontWeight: 600, color: T.text2, marginBottom: 8 }}>{res.chart.title}</div>}
              <Chart spec={res.chart} rows={rows} T={T} />
            </div>
          )}
          {rows.length > 0 && (
            <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>{cols.map((c) => <th key={c} style={{ textAlign: "left", padding: "8px 12px", color: T.text3, fontWeight: 600, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i}>{cols.map((c) => <td key={c} style={{ padding: "7px 12px", color: T.text2, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{fmtCell(r[c])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {res.sql && (
            <div>
              <button onClick={() => setShowSql((v) => !v)} style={{ background: "none", border: "none", color: T.text3, fontSize: 12, cursor: "pointer", padding: 0 }}>{showSql ? "Hide" : "Show"} the query ›</button>
              {showSql && <pre style={{ marginTop: 6, padding: 12, borderRadius: 8, background: T.surface2, color: T.text3, fontSize: 11, whiteSpace: "pre-wrap", overflowX: "auto" }}>{res.sql}</pre>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
