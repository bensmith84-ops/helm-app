"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";

const CCY_SYM = { USD: "$", GBP: "£", AUD: "A$", EUR: "€", CAD: "C$" };
const FLAGS   = { stord_us: "🇺🇸", next3pl_uk: "🇬🇧", next3pl_au: "🇦🇺", next3pl_ca: "🇨🇦" };
const PAGE_SIZE = 100;

const fmtMoney = (n, ccy = "USD", frac = 2) => {
  if (n == null || n === "") return "—";
  const sym = CCY_SYM[ccy] || "$";
  const v = Number(n);
  return (v < 0 ? "-" : "") + sym + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac });
};
const fmtNum = (n) => (n == null || n === "") ? "—" : Number(n).toLocaleString();
const fmtWeight = (n) => (n == null || n === "") ? "—" : Number(n).toFixed(2) + " kg";
const fmtDate = (s) => s || "—";
const truncate = (s, n) => !s ? "" : (s.length > n ? s.slice(0, n - 1) + "…" : s);

// CSV escape
const csvEscape = (v) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function ThreePLOrderDetail({ goBack, initialInvoiceId = null }) {
  const { T } = useTheme();
  const { profile } = useAuth();
  const orgId = profile?.active_org_id;

  const [rows, setRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [providers, setProviders] = useState([]);

  // Filters
  const [providerFilter, setProviderFilter] = useState("");
  const [invoiceIdFilter, setInvoiceIdFilter] = useState(initialInvoiceId);
  const [invoiceLabel, setInvoiceLabel] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortCol, setSortCol] = useState("shipment_date");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);

  // Load providers once for the filter pills
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("wms_3pl_providers").select("id,code,name").eq("is_active", true).order("code");
      if (data) setProviders(data);
    })();
  }, []);

  // If we landed with an invoice filter, fetch its label
  useEffect(() => {
    if (!invoiceIdFilter) { setInvoiceLabel(""); return; }
    (async () => {
      const { data } = await supabase.from("wms_3pl_invoices").select("invoice_number").eq("id", invoiceIdFilter).single();
      if (data) setInvoiceLabel(data.invoice_number);
    })();
  }, [invoiceIdFilter]);

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0); }, [providerFilter, invoiceIdFilter, search, dateFrom, dateTo, sortCol, sortDir]);

  const buildQuery = useCallback((q) => {
    if (providerFilter) q = q.eq("provider_code", providerFilter);
    if (invoiceIdFilter) q = q.eq("invoice_id", invoiceIdFilter);
    if (dateFrom) q = q.gte("shipment_date", dateFrom);
    if (dateTo)   q = q.lte("shipment_date", dateTo);
    if (search && search.trim()) {
      const s = search.trim().replace(/[%,]/g, "");
      q = q.or(`external_order_no.ilike.%${s}%,shopify_order_id.ilike.%${s}%,tracking_number.ilike.%${s}%`);
    }
    return q;
  }, [providerFilter, invoiceIdFilter, search, dateFrom, dateTo]);

  const fetchRows = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setErr(null);
    try {
      let q = supabase
        .from("wms_3pl_order_detail")
        .select("*", { count: "exact" })
        .eq("org_id", orgId);
      q = buildQuery(q);
      q = q.order(sortCol, { ascending: sortDir === "asc", nullsFirst: false });
      q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      setRows(data || []);
      setTotalRows(count || 0);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [orgId, buildQuery, sortCol, sortDir, page]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const handleExportCSV = useCallback(async () => {
    if (!orgId || exporting) return;
    setExporting(true);
    try {
      const allRows = [];
      let off = 0;
      while (off < 100000) { // safety cap
        let q = supabase.from("wms_3pl_order_detail").select("*").eq("org_id", orgId);
        q = buildQuery(q);
        q = q.order(sortCol, { ascending: sortDir === "asc", nullsFirst: false }).range(off, off + 4999);
        const { data, error } = await q;
        if (error) throw error;
        allRows.push(...(data || []));
        if (!data || data.length < 5000) break;
        off += 5000;
      }
      const cols = [
        "provider_code", "invoice_number", "external_order_no", "shopify_order_id", "tracking_number",
        "shipment_date", "carrier", "service_level", "zone", "weight_kg",
        "recipient_country", "recipient_region", "recipient_city", "recipient_postal", "warehouse_code",
        "units_shipped", "sku_count", "skus_summary",
        "freight_cost", "fuel_surcharge", "other_surcharges", "total_cost", "currency", "cost_per_unit",
      ];
      const csv = [cols.join(","), ...allRows.map(r => cols.map(c => csvEscape(r[c])).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `3pl-order-detail-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
    } catch (e) {
      setErr("Export failed: " + (e.message || String(e)));
    } finally {
      setExporting(false);
    }
  }, [orgId, buildQuery, sortCol, sortDir, exporting]);

  // Page-level summary (just the current page totals — cheap and meaningful)
  const pageSummary = useMemo(() => {
    const tot = rows.reduce((s, r) => s + (Number(r.total_cost) || 0), 0);
    const wt  = rows.reduce((s, r) => s + (Number(r.weight_kg)  || 0), 0);
    const units = rows.reduce((s, r) => s + (Number(r.units_shipped) || 0), 0);
    const currencies = Array.from(new Set(rows.map(r => r.currency).filter(Boolean)));
    return { tot, wt, units, currencies };
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const filterActive = providerFilter || invoiceIdFilter || search || dateFrom || dateTo;

  // Styling helpers
  const th = { padding: "10px 8px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "left", borderBottom: `2px solid ${T.border}`, background: T.surface, position: "sticky", top: 0, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" };
  const thNum = { ...th, textAlign: "right" };
  const td = { padding: "8px", fontSize: 12, color: T.text2, borderBottom: `1px solid ${T.border}30`, whiteSpace: "nowrap" };
  const tdNum = { ...td, textAlign: "right", fontFamily: "monospace" };
  const tdMono = { ...td, fontFamily: "monospace" };
  const btn = { padding: "6px 12px", fontSize: 11, fontWeight: 600, borderRadius: 14, border: `1px solid ${T.border}`, background: T.surface2, color: T.text2, cursor: "pointer" };
  const btnActive = { ...btn, background: T.accent || "#3B82F6", color: "#fff", borderColor: "transparent" };
  const input = { padding: "6px 10px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text };

  const arrow = (col) => sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div style={{ position: "relative" }}>
      {/* ── Header row ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>📦 Order Detail</div>
          <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
            Per-shipment charges, weight, and destination across all 3PL providers.
            {invoiceLabel && <span style={{ marginLeft: 8, padding: "2px 8px", background: T.surface2, borderRadius: 4 }}>filtered: {invoiceLabel}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={handleExportCSV} disabled={exporting || loading} style={{ ...btn, opacity: (exporting || loading) ? 0.5 : 1 }}>
            {exporting ? "Exporting…" : "⬇ Export CSV"}
          </button>
          {goBack && <button onClick={goBack} style={btn}>← Back</button>}
        </div>
      </div>

      {/* ── Filter row ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, alignItems: "center" }}>
        <button onClick={() => setProviderFilter("")} style={providerFilter === "" ? btnActive : btn}>All providers</button>
        {providers.map(p => (
          <button key={p.code} onClick={() => setProviderFilter(p.code)} style={providerFilter === p.code ? btnActive : btn}>
            {FLAGS[p.code]} {p.code.replace("_", " ")}
          </button>
        ))}
        <div style={{ width: 1, height: 22, background: T.border, margin: "0 4px" }} />
        <input type="text" placeholder="🔎 order # / tracking #" value={search} onChange={e => setSearch(e.target.value)} style={{ ...input, minWidth: 200 }} />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" style={input} />
        <span style={{ color: T.text3, fontSize: 11 }}>→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" style={input} />
        {filterActive && (
          <button onClick={() => { setProviderFilter(""); setInvoiceIdFilter(null); setSearch(""); setDateFrom(""); setDateTo(""); }}
            style={{ ...btn, color: "#EF4444", borderColor: "#EF4444" }}>✕ Clear</button>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: T.text3 }}>
          {totalRows.toLocaleString()} shipment{totalRows === 1 ? "" : "s"}
          {pageSummary.currencies.length === 1 && (
            <span style={{ marginLeft: 8 }}>· page total {fmtMoney(pageSummary.tot, pageSummary.currencies[0])}</span>
          )}
        </div>
      </div>

      {err && <div style={{ padding: 12, marginBottom: 12, background: "#FEE2E2", color: "#991B1B", borderRadius: 6, fontSize: 12 }}>{err}</div>}

      {/* ── Table ── */}
      <div style={{ overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 8, maxHeight: "70vh" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1400 }}>
          <thead>
            <tr>
              <th style={th} onClick={() => handleSort("provider_code")}>Provider{arrow("provider_code")}</th>
              <th style={th} onClick={() => handleSort("invoice_number")}>Invoice{arrow("invoice_number")}</th>
              <th style={th} onClick={() => handleSort("external_order_no")}>Order #{arrow("external_order_no")}</th>
              <th style={th} onClick={() => handleSort("shipment_date")}>Ship date{arrow("shipment_date")}</th>
              <th style={th} onClick={() => handleSort("carrier")}>Carrier{arrow("carrier")}</th>
              <th style={th} onClick={() => handleSort("service_level")}>Service{arrow("service_level")}</th>
              <th style={th} onClick={() => handleSort("zone")}>Zone{arrow("zone")}</th>
              <th style={thNum} onClick={() => handleSort("weight_kg")}>Weight{arrow("weight_kg")}</th>
              <th style={th}>Destination</th>
              <th style={thNum} onClick={() => handleSort("units_shipped")}>Units{arrow("units_shipped")}</th>
              <th style={thNum} onClick={() => handleSort("sku_count")}>SKUs{arrow("sku_count")}</th>
              <th style={thNum} onClick={() => handleSort("freight_cost")}>Freight{arrow("freight_cost")}</th>
              <th style={thNum} onClick={() => handleSort("fuel_surcharge")}>Fuel{arrow("fuel_surcharge")}</th>
              <th style={thNum} onClick={() => handleSort("other_surcharges")}>Other{arrow("other_surcharges")}</th>
              <th style={thNum} onClick={() => handleSort("total_cost")}>Total{arrow("total_cost")}</th>
              <th style={thNum} onClick={() => handleSort("cost_per_unit")}>$/unit{arrow("cost_per_unit")}</th>
              <th style={th}>Tracking</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={17} style={{ padding: 24, textAlign: "center", color: T.text3, fontSize: 12 }}>Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={17} style={{ padding: 24, textAlign: "center", color: T.text3, fontSize: 12 }}>No shipments match your filters.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.shipment_id} style={{ background: r.is_adjustment ? "#FEF3C720" : "transparent" }}>
                <td style={td}>{FLAGS[r.provider_code]} {r.provider_code?.replace("_", " ")}</td>
                <td style={tdMono} title={r.invoice_number}>{truncate(r.invoice_number, 14)}</td>
                <td style={tdMono} title={r.shopify_order_id || r.external_order_no}>{r.external_order_no || "—"}</td>
                <td style={td}>{fmtDate(r.shipment_date)}</td>
                <td style={td}>{r.carrier || "—"}</td>
                <td style={td} title={r.service_level}>{truncate(r.service_level, 24) || "—"}</td>
                <td style={td}>{r.zone || "—"}</td>
                <td style={tdNum}>{fmtWeight(r.weight_kg)}</td>
                <td style={td}>
                  {[r.recipient_city, r.recipient_region, r.recipient_postal, r.recipient_country].filter(Boolean).join(", ") || "—"}
                </td>
                <td style={tdNum}>{r.units_shipped > 0 ? fmtNum(r.units_shipped) : "—"}</td>
                <td style={tdNum}>{r.sku_count > 0 ? fmtNum(r.sku_count) : "—"}</td>
                <td style={tdNum}>{fmtMoney(r.freight_cost, r.currency)}</td>
                <td style={tdNum}>{Number(r.fuel_surcharge) > 0 ? fmtMoney(r.fuel_surcharge, r.currency) : "—"}</td>
                <td style={tdNum}>{Number(r.other_surcharges) > 0 ? fmtMoney(r.other_surcharges, r.currency) : "—"}</td>
                <td style={{ ...tdNum, fontWeight: 700, color: T.text }}>{fmtMoney(r.total_cost, r.currency)}</td>
                <td style={tdNum}>{r.cost_per_unit != null ? fmtMoney(r.cost_per_unit, r.currency, 3) : "—"}</td>
                <td style={tdMono} title={r.tracking_number}>{truncate(r.tracking_number, 16) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 11, color: T.text3 }}>
          {totalRows === 0 ? "—" : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalRows)} of ${totalRows.toLocaleString()}`}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => setPage(0)} disabled={page === 0} style={{ ...btn, opacity: page === 0 ? 0.5 : 1 }}>« First</button>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ ...btn, opacity: page === 0 ? 0.5 : 1 }}>‹ Prev</button>
          <span style={{ fontSize: 12, color: T.text3, padding: "0 8px" }}>Page {page + 1} / {totalPages.toLocaleString()}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page + 1 >= totalPages} style={{ ...btn, opacity: page + 1 >= totalPages ? 0.5 : 1 }}>Next ›</button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page + 1 >= totalPages} style={{ ...btn, opacity: page + 1 >= totalPages ? 0.5 : 1 }}>Last »</button>
        </div>
      </div>
    </div>
  );
}
