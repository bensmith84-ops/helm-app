"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

// ─── SheetJS loaded from CDN at runtime (no npm dependency) ────────────────
// We load on first mount and cache the global. Avoids touching package.json.
let xlsxLoaderPromise = null;
function loadSheetJS() {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxLoaderPromise) return xlsxLoaderPromise;
  xlsxLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    script.async = true;
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("Failed to load SheetJS"));
    document.head.appendChild(script);
  });
  return xlsxLoaderPromise;
}

// ─── Canonical fee taxonomy ────────────────────────────────────────────────
// canonical_category values used in reports. Keep stable — schema constraint.
const CATEGORIES = [
  { key: "inbound_unloading",  label: "Inbound: Unloading",   color: "#8B5CF6" },
  { key: "inbound_receiving",  label: "Inbound: Receiving",   color: "#A78BFA" },
  { key: "storage",            label: "Storage",              color: "#3B82F6" },
  { key: "order_processing",   label: "Order Processing",     color: "#10B981" },
  { key: "pick_pack",          label: "Pick & Pack",          color: "#06B6D4" },
  { key: "outbound_handling",  label: "Outbound Handling",    color: "#0EA5E9" },
  { key: "freight",            label: "Freight",              color: "#F59E0B" },
  { key: "labour",             label: "Labour",               color: "#EC4899" },
  { key: "vas",                label: "VAS (Value-Add)",      color: "#F472B6" },
  { key: "materials",          label: "Materials",            color: "#84CC16" },
  { key: "admin",              label: "Admin / Account Mgmt", color: "#94A3B8" },
  { key: "accessorial",        label: "Accessorial",          color: "#EF4444" },
  { key: "adjustment",         label: "Adjustment",           color: "#6366F1" },
  { key: "other",              label: "Other",                color: "#64748B" },
];
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

// Heuristic mapping of raw 3PL category labels → canonical category.
// Section-level (Next3PL Warehouse Rates groupings) AND line-level (Stord items)
// both feed through this so the user sees consistent classification on review.
const RAW_TO_CANONICAL = [
  // Next3PL section headers (from Warehouse Rates "Charge Categories" column)
  { pattern: /^Unloading Charges?/i,           cat: "inbound_unloading" },
  { pattern: /Receiving Charges?/i,            cat: "inbound_receiving" },
  { pattern: /^Inbound (Activity|Handling)/i,  cat: "inbound_receiving" },
  { pattern: /Storage Charges?/i,              cat: "storage" },
  { pattern: /^Storage/i,                      cat: "storage" },
  { pattern: /^Pallet Hire/i,                  cat: "storage" },
  { pattern: /Order Processing/i,              cat: "order_processing" },
  { pattern: /Pick.*Pack|Picking|Packing/i,    cat: "pick_pack" },
  { pattern: /Outbound (Handling|Activity)/i,  cat: "outbound_handling" },
  { pattern: /Kitting/i,                       cat: "pick_pack" },
  { pattern: /Labour Charges?|Labor/i,         cat: "labour" },
  { pattern: /Admin|Setup|Account Management/i,cat: "admin" },
  { pattern: /Freight Charges?|Transport|Shipping|Carrier|Royal Mail|Canada Post|UPS|FedEx|DHL|UNIUNI|CANPAR|Intelcom|eParcel/i, cat: "freight" },
  { pattern: /Fuel Surcharge/i,                cat: "freight" },
  { pattern: /VAS|Value.Add/i,                 cat: "vas" },
  { pattern: /Materials|Packaging|Site Supp/i, cat: "materials" },
  { pattern: /Adjust|Refund|Credit|Brun.*diff/i,cat: "adjustment" },
  { pattern: /Other Charges?|Extras?|Destruction/i, cat: "other" },
  { pattern: /Surcharge|Accessorial|Peak/i,    cat: "accessorial" },
];
function classifyRaw(raw) {
  if (!raw) return "other";
  const s = String(raw).trim();
  for (const r of RAW_TO_CANONICAL) if (r.pattern.test(s)) return r.cat;
  return "other";
}

const PROVIDERS_META = {
  next3pl_uk: { label: "Next3PL Ltd (UK)",       flag: "🇬🇧", currency: "GBP" },
  next3pl_au: { label: "Next Logistics (AU)",    flag: "🇦🇺", currency: "AUD" },
  next3pl_ca: { label: "Next3pl US LLC (CA)",    flag: "🇨🇦", currency: "USD" },
  stord_us:   { label: "Stord (US)",             flag: "🇺🇸", currency: "USD" },
};

// ─── Helpers ───────────────────────────────────────────────────────────────
const toDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().split("T")[0];
  const s = String(v);
  const m = s.match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/);
  if (m) {
    let [_, a, b, c] = m;
    if (c.length === 2) c = "20" + c;
    // Assume MM.DD.YYYY (US format) when month <= 12; otherwise DD/MM
    const mo = +a, d = +b;
    return `${c}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }
  const d2 = new Date(s);
  if (!isNaN(d2)) return d2.toISOString().split("T")[0];
  return null;
};
const num = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[$,£€\s]/g, ""));
  return isNaN(n) ? 0 : n;
};
const fmtCurrency = (n, currency = "USD") => {
  const symbols = { USD: "$", GBP: "£", AUD: "A$", EUR: "€", CAD: "C$" };
  const s = symbols[currency] || currency + " ";
  return s + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtCompact = (n) => {
  const abs = Math.abs(n || 0);
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return (n || 0).toFixed(0);
};

// ─── Format detection ──────────────────────────────────────────────────────
// Inspects sheet names + a few key cells to decide which parser to use.
function detectFormat(workbook, filename = "") {
  const sheets = workbook.SheetNames.map(s => s.toLowerCase());
  const fn = filename.toLowerCase();

  // Stord consolidated transaction report
  if (sheets.includes("parcel txns") || sheets.includes("parcel backup report") || sheets.includes("parcel backup summary")) {
    return { format: "stord_consolidated", provider: "stord_us" };
  }
  // Stord customer billing
  if (sheets.includes("billing summary") && (sheets.includes("ob lines") || sheets.includes("ib lpns") || sheets.includes("vas"))) {
    // detect warehouse from the billing summary first cell
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const headerCell = ws["A1"]?.v || "";
    let warehouse = null;
    if (/CVG/i.test(headerCell) || /CVG/.test(fn)) warehouse = "CVG";
    else if (/RNO/i.test(headerCell) || /RNO/.test(fn)) warehouse = "RNO";
    return { format: "stord_customer", provider: "stord_us", warehouse };
  }
  // Next3PL family — has "Warehouse Invoice" + "Warehouse Rates"
  if (sheets.some(s => s.includes("warehouse rates")) && sheets.some(s => s.includes("warehouse invoice"))) {
    // Sub-distinguish UK monthly vs AU weekly vs CA weekly
    // UK: "Monthly Tracking" sheet, monthly billing period
    // AU: 'Datasheet' sheet, weekly billing, ABN
    // CA (Next3pl US LLC): "Spend Tracking" sheet, weekly billing, EIN
    if (sheets.includes("monthly tracking")) return { format: "next3pl_uk_monthly", provider: "next3pl_uk" };
    if (sheets.includes("datasheet")) return { format: "next3pl_au_warehouse", provider: "next3pl_au" };
    if (sheets.includes("spend tracking")) return { format: "next3pl_ca_weekly", provider: "next3pl_ca" };
    // Fallback: ambiguous Next3PL — let user pick
    return { format: "next3pl_unknown", provider: null };
  }
  // Next3PL AU transport (Freight + eParcel only)
  if (sheets.includes("freight") && sheets.includes("eparcel")) {
    return { format: "next3pl_au_transport", provider: "next3pl_au" };
  }
  return { format: "unknown", provider: null };
}

// ─── Parsers ───────────────────────────────────────────────────────────────

// Get a sheet as a 2D array of values
function sheetToRows(ws, xlsx) {
  if (!ws) return [];
  return xlsx.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
}

// Parse Next3PL UK monthly / AU warehouse / CA weekly — all share the same
// Warehouse Rates structure. Section headers in column D (4th col) trigger
// canonical_category changes; subsequent rows are line items.
function parseNext3PL(workbook, xlsx, hint = {}) {
  const result = {
    header: { invoice_number: null, invoice_date: null, due_date: null, period_start: null, period_end: null, total: 0, subtotal: 0, currency: "USD", warehouse_code: null, raw_summary: {} },
    lines: [], shipments: [], orderLines: [],
    detected_format: hint.format || "next3pl",
  };

  // ── Header from "Warehouse Invoice" sheet ─────────────
  const wsInv = workbook.Sheets[workbook.SheetNames.find(s => /warehouse invoice/i.test(s))];
  if (wsInv) {
    const rows = sheetToRows(wsInv, xlsx);
    const summary = {};
    let total = 0;
    for (let r = 0; r < Math.min(rows.length, 60); r++) {
      const row = rows[r] || [];
      const cells = row.map(c => c == null ? "" : String(c).trim());
      const joined = cells.join(" | ");
      // Invoice number — pattern like N3PL0244-1012608 or L491607 or F491749
      const invMatch = joined.match(/\b([NLFA]\w*\d{4,}[-\d]*)\b/);
      if (invMatch && !result.header.invoice_number) result.header.invoice_number = invMatch[1];
      // Dates
      if (/Invoice Date/i.test(joined) || /Inv\.?\s*Date/i.test(joined)) {
        for (const c of row) { const d = toDate(c); if (d) { result.header.invoice_date = d; break; } }
      }
      if (/Due Date/i.test(joined)) {
        for (const c of row) { const d = toDate(c); if (d) { result.header.due_date = d; break; } }
      }
      // Currency from summary line
      if (joined.includes("£")) result.header.currency = "GBP";
      else if (joined.includes("A$") || joined.includes("AUD")) result.header.currency = "AUD";
      else if (joined.includes("$") && hint.provider !== "next3pl_uk" && hint.provider !== "next3pl_au") result.header.currency = "USD";

      // Summary categories with totals (UK PDF-style layout): col 2 = label, col 4 = amount
      for (let ci = 1; ci < cells.length - 1; ci++) {
        const label = cells[ci];
        for (let cj = ci + 1; cj < cells.length; cj++) {
          const v = num(row[cj]);
          if (v > 0 && /Charges?|Total/i.test(label)) {
            summary[label] = v;
            if (/Total Amount Due|Sub.?total|Invoice Total/i.test(label)) total = Math.max(total, v);
            break;
          }
        }
      }
    }
    result.header.raw_summary = summary;
    if (total > 0) { result.header.total = total; result.header.subtotal = total; }
  }

  // ── Line items from "Warehouse Rates" ────────────────
  const wsRates = workbook.Sheets[workbook.SheetNames.find(s => /warehouse rates/i.test(s))];
  if (wsRates) {
    const rows = sheetToRows(wsRates, xlsx);
    // Find the period from a row like "Billing For Week Ending: 1 Mar..." or "Billing For Month: March-2026"
    for (const row of rows.slice(0, 12)) {
      const joined = (row || []).map(c => String(c || "")).join(" ");
      const periodMatch = joined.match(/Billing For (?:Week Ending|Month):\s*([^|]+?)(?:\s*\|\s*Month|\s*\|\s*Week|\s*$)/i);
      if (periodMatch) {
        // Try to parse the month name into period_start/period_end
        const periodStr = periodMatch[1].trim();
        // Month format: "March-2026" → first/last of March
        const mMatch = periodStr.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)[\s-]+(\d{4})/i);
        if (mMatch) {
          const monthIdx = ["january","february","march","april","may","june","july","august","september","october","november","december"].indexOf(mMatch[1].toLowerCase());
          const yr = +mMatch[2];
          const start = new Date(yr, monthIdx, 1);
          const end = new Date(yr, monthIdx + 1, 0);
          result.header.period_start = start.toISOString().split("T")[0];
          result.header.period_end = end.toISOString().split("T")[0];
        } else {
          // Week format: "1 Mar 2026" → that week (Mon-Sun)
          const d = toDate(periodStr);
          if (d) {
            result.header.period_end = d;
            const ed = new Date(d); ed.setDate(ed.getDate() - 6);
            result.header.period_start = ed.toISOString().split("T")[0];
          }
        }
        break;
      }
    }

    // Iterate rows, finding category sections + line items.
    // Pattern observed: header rows have "Rate | Qty | Total | Notes" in cols 5,6,7,8.
    // The Charge Category text appears in col 4 of the same header row.
    // Subsequent data rows have: col 2 = activity, col 3 = sub-category, col 4 = description,
    // col 5 = rate, col 6 = qty, col 7 = total, col 8 = notes.
    let currentCanonical = "other";
    let currentRawCategory = null;
    let lineNo = 0;
    for (const row of rows) {
      if (!row) continue;
      const cells = row.map(c => c == null ? "" : c);
      // Is this a section header? "Rate | Qty | Total" pattern
      const isHeader = cells[4] === "Rate" && cells[5] === "Qty" && cells[6] === "Total";
      if (isHeader) {
        const cat = cells[3];
        if (cat) {
          currentRawCategory = String(cat).trim();
          currentCanonical = classifyRaw(currentRawCategory);
        }
        continue;
      }
      // Data row: needs rate, qty, total
      const rate = num(cells[4]);
      const qty = num(cells[5]);
      const total = num(cells[6]);
      const desc = cells[3];
      if (!desc || (rate === 0 && qty === 0 && total === 0)) continue;
      if (total === 0 && qty === 0) continue; // skip zero rows
      lineNo++;
      result.lines.push({
        line_no: lineNo,
        canonical_category: currentCanonical,
        raw_category: currentRawCategory,
        description: String(desc).trim(),
        uom: cells[2] ? String(cells[2]).trim() : null, // sub-category cell
        rate,
        quantity: qty,
        amount: total,
        notes: cells[7] ? String(cells[7]).trim() : null,
        carrier: null,
      });
    }
  }

  // ── Freight from "Transport" sheet (if present — UK monthly & CA weekly include it) ─────
  const wsTransport = workbook.Sheets[workbook.SheetNames.find(s => /^transport$/i.test(s) || /freight charges/i.test(s))];
  if (wsTransport) {
    const rows = sheetToRows(wsTransport, xlsx);
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const r = (rows[i] || []).map(c => String(c || "").toLowerCase());
      if (r.some(c => c.includes("service") || c.includes("carrier")) && r.some(c => c.includes("qty"))) { headerIdx = i; break; }
    }
    if (headerIdx >= 0) {
      // Find which columns hold what
      const header = (rows[headerIdx] || []).map(c => String(c || "").toLowerCase());
      const idxDate    = header.findIndex(c => /date|wk/i.test(c));
      const idxService = header.findIndex(c => /service|carrier/i.test(c));
      const idxRate    = header.findIndex(c => /rate/i.test(c));
      const idxQty     = header.findIndex(c => /qty/i.test(c));
      const idxTotal   = header.findIndex(c => /total/i.test(c));
      let lineNo = result.lines.length;
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const service = row[idxService] ? String(row[idxService]).trim() : null;
        const total = num(row[idxTotal]);
        const qty = num(row[idxQty]);
        if (!service || total === 0) continue;
        lineNo++;
        result.lines.push({
          line_no: lineNo,
          canonical_category: "freight",
          raw_category: "Freight",
          description: service,
          uom: "Per Shipment",
          rate: num(row[idxRate]),
          quantity: qty,
          amount: total,
          notes: null,
          carrier: service.split(/\s+/)[0],
        });
      }
    }
  }

  // ── Extras (one-off adjustments) ─────────
  const wsExtras = workbook.Sheets[workbook.SheetNames.find(s => /^extras?$/i.test(s))];
  if (wsExtras) {
    const rows = sheetToRows(wsExtras, xlsx);
    if (rows.length > 0) {
      const header = (rows[0] || []).map(c => String(c || "").toLowerCase());
      const idxDesc  = header.indexOf("description");
      const idxType  = header.findIndex(c => /chargetype|charge type/i.test(c));
      const idxRate  = header.findIndex(c => /unit charge|rate/i.test(c));
      const idxQty   = header.indexOf("qty");
      const idxTotal = header.indexOf("total");
      const idxNote  = header.indexOf("note");
      let lineNo = result.lines.length;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const total = num(row[idxTotal]);
        if (total === 0) continue;
        const desc = row[idxDesc] ? String(row[idxDesc]).trim() : null;
        if (!desc) continue;
        lineNo++;
        const cat = classifyRaw(desc) || "other";
        result.lines.push({
          line_no: lineNo,
          canonical_category: cat,
          raw_category: row[idxType] ? String(row[idxType]).trim() : "Extras",
          description: desc,
          uom: null,
          rate: num(row[idxRate]),
          quantity: num(row[idxQty]),
          amount: total,
          notes: row[idxNote] ? String(row[idxNote]).trim() : null,
          carrier: null,
        });
      }
    }
  }

  // ── Activity Detail (per-order shipments + order lines) ─────────
  // UK has "Details" sheet (42 cols, per-despatch); AU/CA has "Activity Detail" (6 cols, per-line)
  const wsActivity = workbook.Sheets[workbook.SheetNames.find(s => /^activity detail$/i.test(s) || /^details?$/i.test(s))];
  if (wsActivity) {
    const rows = sheetToRows(wsActivity, xlsx);
    if (rows.length > 1) {
      const header = (rows[0] || []).map(c => String(c || ""));
      const lc = header.map(c => c.toLowerCase());
      const idxOrder = lc.findIndex(c => /order code|order id|web order|despatch no/i.test(c));
      const idxDate  = lc.findIndex(c => /ship date|despatch.*date|date/i.test(c));
      const idxSku   = lc.findIndex(c => c === "sku");
      const idxQty   = lc.findIndex(c => /^qty$|quantity/i.test(c));
      const idxDesc  = lc.findIndex(c => /description|product/i.test(c));
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const order = idxOrder >= 0 ? row[idxOrder] : null;
        const sku = idxSku >= 0 ? row[idxSku] : null;
        if (!order && !sku) continue;
        const shipDate = idxDate >= 0 ? toDate(row[idxDate]) : null;
        const qty = num(idxQty >= 0 ? row[idxQty] : 0);
        if (sku && qty > 0) {
          result.orderLines.push({
            shipment_date: shipDate,
            external_order_no: order ? String(order).trim() : null,
            sku: String(sku).trim(),
            product_title: idxDesc >= 0 && row[idxDesc] ? String(row[idxDesc]).trim() : null,
            uom: "ea",
            quantity_shipped: qty,
            warehouse_code: hint.warehouse || null,
          });
        }
      }
    }
  }

  // ── Per-shipment freight detail (AU eParcel sheet OR CA Freight Detail) ─────────
  const wsParcel = workbook.Sheets[workbook.SheetNames.find(s => /^eparcel$/i.test(s) || /^freight detail$/i.test(s))];
  if (wsParcel) {
    const rows = sheetToRows(wsParcel, xlsx);
    if (rows.length > 1) {
      const header = (rows[0] || []).map(c => String(c || "").toLowerCase());
      const idxOrder = header.findIndex(c => /reference|order|req/i.test(c) && !c.includes("customer"));
      const idxDate  = header.findIndex(c => /ship date|date/i.test(c));
      const idxCarr  = header.findIndex(c => /carrier|service/i.test(c));
      const idxZone  = header.findIndex(c => /zone/i.test(c));
      const idxWt    = header.findIndex(c => /weight/i.test(c));
      const idxCost  = header.findIndex(c => /subtotal|cost|total/i.test(c) && !c.includes("fuel"));
      const idxCountry = header.findIndex(c => /country|destination/i.test(c));
      const idxRegion = header.findIndex(c => /state|province/i.test(c));
      const idxCity = header.findIndex(c => /city|suburb/i.test(c));
      const idxPostal = header.findIndex(c => /postal|postcode|zip/i.test(c));
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const order = idxOrder >= 0 ? row[idxOrder] : null;
        if (!order) continue;
        result.shipments.push({
          shipment_date: idxDate >= 0 ? toDate(row[idxDate]) : null,
          external_order_no: String(order).trim(),
          carrier: idxCarr >= 0 && row[idxCarr] ? String(row[idxCarr]).trim() : null,
          service_level: idxCarr >= 0 && row[idxCarr] ? String(row[idxCarr]).trim() : null,
          zone: idxZone >= 0 && row[idxZone] ? String(row[idxZone]).trim() : null,
          weight_kg: idxWt >= 0 ? num(row[idxWt]) : null,
          freight_cost: idxCost >= 0 ? num(row[idxCost]) : null,
          total_cost: idxCost >= 0 ? num(row[idxCost]) : null,
          recipient_country: idxCountry >= 0 && row[idxCountry] ? String(row[idxCountry]).trim() : null,
          recipient_region: idxRegion >= 0 && row[idxRegion] ? String(row[idxRegion]).trim() : null,
          recipient_city: idxCity >= 0 && row[idxCity] ? String(row[idxCity]).trim() : null,
          recipient_postal: idxPostal >= 0 && row[idxPostal] ? String(row[idxPostal]).trim() : null,
          warehouse_code: hint.warehouse || null,
        });
      }
    }
  }

  // ── Compute units_shipped + orders_shipped (denominators for cost-per analyses) ─────
  result.header.units_shipped = result.orderLines.reduce((s, l) => s + (l.quantity_shipped || 0), 0) || null;
  result.header.orders_shipped = new Set(result.orderLines.map(l => l.external_order_no).filter(Boolean)).size || null;

  // If we couldn't find an explicit total, sum the lines
  if (!result.header.total || result.header.total === 0) {
    result.header.total = result.lines.reduce((s, l) => s + (l.amount || 0), 0);
    result.header.subtotal = result.header.total;
  }
  return result;
}

// Parse Stord _CUSTOMER.xlsx — main warehouse billing
function parseStordCustomer(workbook, xlsx, hint = {}) {
  const result = {
    header: { invoice_number: null, invoice_date: null, period_start: null, period_end: null, total: 0, subtotal: 0, currency: "USD", warehouse_code: hint.warehouse || null, raw_summary: {} },
    lines: [], shipments: [], orderLines: [],
    detected_format: "stord_customer",
  };

  // Billing Summary header
  const wsSum = workbook.Sheets[workbook.SheetNames.find(s => /billing summary/i.test(s))];
  if (wsSum) {
    const rows = sheetToRows(wsSum, xlsx);
    // r1: "Earth Breeze - CVG" — warehouse code already from filename detection
    // r2: "March 1-15, 2026" — period
    if (rows[1] && rows[1][0]) {
      const periodStr = String(rows[1][0]).trim();
      // Parse "March 1-15, 2026" or "April 1-30, 2026"
      const m = periodStr.match(/^(\w+)\s+(\d+)-(\d+),?\s+(\d{4})/);
      if (m) {
        const monthIdx = ["january","february","march","april","may","june","july","august","september","october","november","december"].indexOf(m[1].toLowerCase());
        if (monthIdx >= 0) {
          const yr = +m[4];
          result.header.period_start = new Date(yr, monthIdx, +m[2]).toISOString().split("T")[0];
          result.header.period_end = new Date(yr, monthIdx, +m[3]).toISOString().split("T")[0];
          result.header.invoice_date = result.header.period_end;
        }
      }
    }
    // Walk rows for line items: "Item | UoM | Rate | Qty | Total" starting around r5
    let inItems = false;
    let lineNo = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const cells = row.map(c => c == null ? "" : String(c).trim());
      if (cells[1] === "Item" && (cells[3] === "Rate" || cells[3] === "Rate ")) { inItems = true; continue; }
      if (!inItems) continue;
      // INVOICE TOTAL marker
      const totalCell = cells.find(c => /INVOICE TOTAL/i.test(c));
      if (totalCell) {
        for (const c of row) { const n = num(c); if (n > 100) { result.header.total = n; result.header.subtotal = n; break; } }
        continue;
      }
      const item = cells[1], uom = cells[2], rate = num(row[3]), qty = num(row[4]), total = num(row[5]);
      if (!item || (total === 0 && qty === 0)) continue;
      if (item === "Item") continue;
      lineNo++;
      result.lines.push({
        line_no: lineNo,
        canonical_category: classifyRaw(item),
        raw_category: item.split(/\s*[-—]\s*/)[0],
        description: item,
        uom: uom || null,
        rate, quantity: qty, amount: total,
        notes: null, carrier: null,
      });
    }
  }

  // Build invoice number from file (Stord doesn't put a clean one in the sheet)
  if (!result.header.invoice_number) {
    // We'll fill this in from the upload UI via the file name (INV6042324 prefix)
    result.header.invoice_number = hint.invoice_number_from_filename || null;
  }

  // OB Lines — per-order shipments + order lines
  const wsOB = workbook.Sheets[workbook.SheetNames.find(s => /^ob lines$/i.test(s))];
  if (wsOB) {
    const rows = sheetToRows(wsOB, xlsx);
    if (rows.length > 1) {
      const header = (rows[0] || []).map(c => String(c || "").toLowerCase());
      const idxExt   = header.findIndex(c => /external order/i.test(c));
      const idxBld   = header.findIndex(c => /building name/i.test(c));
      const idxSku   = header.indexOf("sku");
      const idxUom   = header.indexOf("uom");
      const idxQty   = header.findIndex(c => /shipped quantity|requested quantity/i.test(c));
      const idxDate  = header.findIndex(c => /shipped at|ship date|shipped date/i.test(c));
      const seenOrders = new Map();
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const ext = row[idxExt];
        const sku = row[idxSku];
        if (!ext || !sku) continue;
        const orderNo = String(ext).trim().replace(/^#/, "");
        const qty = num(idxQty >= 0 ? row[idxQty] : 0);
        const shipDate = idxDate >= 0 ? toDate(row[idxDate]) : null;
        const warehouseFromBld = idxBld >= 0 && row[idxBld] ? String(row[idxBld]).match(/CVG|RNO/i)?.[0]?.toUpperCase() : null;
        // Order lines (each SKU row)
        result.orderLines.push({
          shipment_date: shipDate,
          external_order_no: orderNo,
          shopify_order_id: orderNo, // Stord's order # matches Shopify in most cases
          sku: String(sku).trim(),
          product_title: null,
          uom: row[idxUom] ? String(row[idxUom]).trim() : "ea",
          quantity_shipped: qty,
          warehouse_code: warehouseFromBld || hint.warehouse || null,
        });
        // Shipments — dedupe by order, sum quantities + SKUs
        if (!seenOrders.has(orderNo)) {
          seenOrders.set(orderNo, {
            shipment_date: shipDate,
            external_order_no: orderNo,
            shopify_order_id: orderNo,
            warehouse_code: warehouseFromBld || hint.warehouse || null,
            units_shipped: 0,
            sku_count: 0,
            _skus: new Set(),
          });
        }
        const sh = seenOrders.get(orderNo);
        sh.units_shipped += qty;
        sh._skus.add(String(sku).trim());
      }
      for (const sh of seenOrders.values()) {
        sh.sku_count = sh._skus.size;
        delete sh._skus;
        result.shipments.push(sh);
      }
    }
  }

  // Counts
  result.header.units_shipped = result.orderLines.reduce((s, l) => s + (l.quantity_shipped || 0), 0) || null;
  result.header.orders_shipped = new Set(result.orderLines.map(l => l.external_order_no).filter(Boolean)).size || null;

  if (!result.header.total || result.header.total === 0) {
    result.header.total = result.lines.reduce((s, l) => s + (l.amount || 0), 0);
    result.header.subtotal = result.header.total;
  }
  return result;
}

// Parse Stord consolidated-transaction-report.xlsx — parcel/freight detail
function parseStordConsolidated(workbook, xlsx, hint = {}) {
  const result = {
    header: { invoice_number: null, invoice_date: null, period_start: null, period_end: null, total: 0, subtotal: 0, currency: "USD", warehouse_code: hint.warehouse || null, raw_summary: { source: "consolidated-transaction-report" } },
    lines: [], shipments: [], orderLines: [],
    detected_format: "stord_consolidated",
  };

  // Parcel Backup Report — per-shipment detail
  const wsBackup = workbook.Sheets[workbook.SheetNames.find(s => /parcel backup report/i.test(s))];
  if (wsBackup) {
    const rows = sheetToRows(wsBackup, xlsx);
    if (rows.length > 1) {
      const header = (rows[0] || []).map(c => String(c || "").toLowerCase());
      const idxInv  = header.findIndex(c => /invoice number/i.test(c));
      const idxDate = header.findIndex(c => /shipped date|invoice date/i.test(c));
      const idxWh   = header.findIndex(c => /warehouse/i.test(c));
      const idxOrd  = header.findIndex(c => /order number/i.test(c));
      const idxSvc  = header.findIndex(c => /service level/i.test(c));
      const idxCarr = header.findIndex(c => /carrier/i.test(c));
      const idxCost = header.findIndex(c => /(billed amount|charge|total|cost)/i.test(c) && !/order/i.test(c));
      const idxZone = header.findIndex(c => /zone/i.test(c));
      const idxWt   = header.findIndex(c => /weight/i.test(c));
      const idxState= header.findIndex(c => /state|province/i.test(c));
      const idxCity = header.findIndex(c => /city/i.test(c));
      const idxZip  = header.findIndex(c => /postal|zip/i.test(c));
      const idxAdj  = header.findIndex(c => /adjustment/i.test(c));

      let earliest = null, latest = null;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const orderNo = idxOrd >= 0 && row[idxOrd] ? String(row[idxOrd]).trim().replace(/^#/, "") : null;
        if (!orderNo) continue;
        if (!result.header.invoice_number && idxInv >= 0 && row[idxInv]) result.header.invoice_number = String(row[idxInv]).trim();
        const shipDate = idxDate >= 0 ? toDate(row[idxDate]) : null;
        if (shipDate) {
          if (!earliest || shipDate < earliest) earliest = shipDate;
          if (!latest || shipDate > latest) latest = shipDate;
        }
        const cost = idxCost >= 0 ? num(row[idxCost]) : 0;
        const carrier = idxCarr >= 0 && row[idxCarr] ? String(row[idxCarr]).trim() : (idxSvc >= 0 && row[idxSvc] ? String(row[idxSvc]).split(/\s+/)[0] : null);
        result.shipments.push({
          shipment_date: shipDate,
          external_order_no: orderNo,
          shopify_order_id: orderNo,
          carrier,
          service_level: idxSvc >= 0 && row[idxSvc] ? String(row[idxSvc]).trim() : null,
          zone: idxZone >= 0 && row[idxZone] ? String(row[idxZone]).trim() : null,
          weight_kg: idxWt >= 0 ? num(row[idxWt]) : null,
          freight_cost: cost,
          total_cost: cost,
          recipient_region: idxState >= 0 && row[idxState] ? String(row[idxState]).trim() : null,
          recipient_city: idxCity >= 0 && row[idxCity] ? String(row[idxCity]).trim() : null,
          recipient_postal: idxZip >= 0 && row[idxZip] ? String(row[idxZip]).trim() : null,
          is_adjustment: idxAdj >= 0 ? (String(row[idxAdj]).toLowerCase() === "true") : false,
          warehouse_code: idxWh >= 0 && row[idxWh] ? String(row[idxWh]).match(/CVG|RNO/i)?.[0]?.toUpperCase() || hint.warehouse : hint.warehouse,
        });
      }
      result.header.period_start = earliest;
      result.header.period_end = latest;
    }
  }

  // Parcel Backup Summary — rolls up to billing lines (one line per service level)
  const wsSummary = workbook.Sheets[workbook.SheetNames.find(s => /parcel backup summary/i.test(s))];
  if (wsSummary) {
    const rows = sheetToRows(wsSummary, xlsx);
    if (rows.length > 1) {
      const header = (rows[0] || []).map(c => String(c || "").toLowerCase());
      const idxAdj = header.findIndex(c => /^adjustment$/i.test(c));
      const idxSvc = header.findIndex(c => /service level/i.test(c));
      const idxCnt = header.findIndex(c => /count/i.test(c));
      const idxTot = header.findIndex(c => /^total$/i.test(c));
      let lineNo = 0;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const svc = idxSvc >= 0 && row[idxSvc] ? String(row[idxSvc]).trim() : null;
        if (!svc) continue;
        const total = num(idxTot >= 0 ? row[idxTot] : 0);
        const cnt = num(idxCnt >= 0 ? row[idxCnt] : 0);
        const adj = idxAdj >= 0 ? (String(row[idxAdj]).toLowerCase() === "true") : false;
        if (total === 0 && !adj) continue;
        lineNo++;
        result.lines.push({
          line_no: lineNo,
          canonical_category: adj ? "adjustment" : "freight",
          raw_category: adj ? "Parcel Adjustment" : "Parcel",
          description: `${adj ? "Adjustment — " : ""}${svc}`,
          uom: "Per Shipment",
          rate: cnt > 0 ? total / cnt : 0,
          quantity: cnt,
          amount: total,
          notes: null,
          carrier: svc.split(/\s+/)[0] === "Stord" ? null : svc.split(/\s+/)[0],
        });
      }
    }
  }
  result.header.total = result.lines.reduce((s, l) => s + (l.amount || 0), 0);
  result.header.subtotal = result.header.total;
  return result;
}

function parseInvoice(workbook, xlsx, filename) {
  const detection = detectFormat(workbook, filename);
  const invMatch = filename.match(/INV(\d+)/i);
  const hint = { ...detection, invoice_number_from_filename: invMatch ? `INV${invMatch[1]}` : null };
  if (detection.format === "next3pl_uk_monthly" || detection.format === "next3pl_au_warehouse" || detection.format === "next3pl_ca_weekly" || detection.format === "next3pl_unknown") {
    return parseNext3PL(workbook, xlsx, hint);
  }
  if (detection.format === "stord_customer") return parseStordCustomer(workbook, xlsx, hint);
  if (detection.format === "stord_consolidated") return parseStordConsolidated(workbook, xlsx, hint);
  // Next3PL AU transport — freight-only file
  if (detection.format === "next3pl_au_transport") {
    // Treat like Next3PL but only Transport sheet
    return parseNext3PL(workbook, xlsx, hint);
  }
  return { header: {}, lines: [], shipments: [], orderLines: [], detected_format: "unknown", error: "Unable to detect format. Supported: Next3PL family (xlsm/xlsx with Warehouse Rates sheet), Stord (Billing Summary or Parcel Backup Report)." };
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function ThreePLBilling() {
  const { tokens: T } = useTheme();
  const { user, profile, orgId } = useAuth();
  const [view, setView] = useState("list"); // list | upload | review | detail
  const [providers, setProviders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [detailLines, setDetailLines] = useState([]);
  const [detailShipments, setDetailShipments] = useState([]);
  const [detailTab, setDetailTab] = useState("lines");

  // Upload + review state
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [parsed, setParsed] = useState(null); // { header, lines, shipments, orderLines, detected_format }
  const [overrideProvider, setOverrideProvider] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState("");
  const [filterProvider, setFilterProvider] = useState("");

  const fileInputRef = useRef(null);

  // ── Load providers + invoices on mount ──
  const loadData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [provR, invR] = await Promise.all([
      supabase.from("wms_3pl_providers").select("*").eq("org_id", orgId).eq("is_active", true).order("name"),
      supabase.from("wms_3pl_invoices").select("*").eq("org_id", orgId).order("period_start", { ascending: false }).limit(200),
    ]);
    setProviders(provR.data || []);
    setInvoices(invR.data || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── File upload + parse ──
  const handleFile = async (file) => {
    if (!file) return;
    setUploadFile(file);
    setParsing(true); setParseError(null); setParsed(null);
    try {
      const xlsx = await loadSheetJS();
      const buf = await file.arrayBuffer();
      const wb = xlsx.read(buf, { type: "array", cellDates: true });
      const result = parseInvoice(wb, xlsx, file.name);
      if (result.error) throw new Error(result.error);
      // Auto-set override provider from detection
      if (!overrideProvider && result.detected_format) {
        const provByFmt = {
          next3pl_uk_monthly: "next3pl_uk",
          next3pl_au_warehouse: "next3pl_au",
          next3pl_au_transport: "next3pl_au",
          next3pl_ca_weekly: "next3pl_ca",
          stord_customer: "stord_us",
          stord_consolidated: "stord_us",
        };
        setOverrideProvider(provByFmt[result.detected_format] || null);
      }
      setParsed(result);
      setView("review");
    } catch (e) {
      setParseError(e.message || String(e));
    } finally {
      setParsing(false);
    }
  };

  // ── Save to DB ──
  const handleSave = async () => {
    if (!parsed || !overrideProvider || !uploadFile) return;
    const provider = providers.find(p => p.code === overrideProvider);
    if (!provider) { alert("Provider not found in DB. Re-seed wms_3pl_providers."); return; }
    setSaving(true);
    try {
      // 1. Upload original file to Supabase Storage for audit
      setSaveProgress("Uploading source file…");
      const path = `${orgId}/3pl-invoices/${provider.code}/${Date.now()}-${uploadFile.name}`;
      let sourceUrl = null;
      try {
        const { data: upR } = await supabase.storage.from("bill-attachments").upload(path, uploadFile, { upsert: true });
        if (upR?.path) sourceUrl = supabase.storage.from("bill-attachments").getPublicUrl(upR.path).data.publicUrl;
      } catch (e) { console.warn("Storage upload failed (continuing without file):", e.message); }

      // 2. Insert invoice header
      setSaveProgress("Saving invoice header…");
      const header = parsed.header;
      const invPayload = {
        org_id: orgId,
        provider_id: provider.id,
        invoice_number: header.invoice_number || `${provider.code}-${Date.now()}`,
        invoice_date: header.invoice_date,
        due_date: header.due_date,
        period_start: header.period_start || header.invoice_date || new Date().toISOString().split("T")[0],
        period_end: header.period_end || header.invoice_date || new Date().toISOString().split("T")[0],
        warehouse_code: header.warehouse_code,
        currency: header.currency || provider.currency,
        subtotal: header.subtotal,
        total: header.total,
        status: "draft",
        source_file_url: sourceUrl,
        source_file_name: uploadFile.name,
        source_file_type: uploadFile.name.split(".").pop().toLowerCase(),
        source_format: parsed.detected_format,
        units_shipped: header.units_shipped,
        orders_shipped: header.orders_shipped,
        raw_summary: header.raw_summary || null,
        imported_by: user?.id || null,
      };
      const { data: invIns, error: invErr } = await supabase.from("wms_3pl_invoices").upsert(invPayload, { onConflict: "org_id,provider_id,invoice_number" }).select().single();
      if (invErr) throw new Error("Invoice header: " + invErr.message);
      const invoiceId = invIns.id;

      // 3. Wipe existing children so re-imports are clean
      await supabase.from("wms_3pl_invoice_lines").delete().eq("invoice_id", invoiceId);
      await supabase.from("wms_3pl_invoice_order_lines").delete().eq("invoice_id", invoiceId);
      await supabase.from("wms_3pl_invoice_shipments").delete().eq("invoice_id", invoiceId);

      // 4. Insert lines (small — usually <50)
      setSaveProgress(`Saving ${parsed.lines.length} line items…`);
      if (parsed.lines.length > 0) {
        const payload = parsed.lines.map(l => ({ ...l, org_id: orgId, invoice_id: invoiceId }));
        const { error } = await supabase.from("wms_3pl_invoice_lines").insert(payload);
        if (error) throw new Error("Lines: " + error.message);
      }

      // 5. Insert shipments (batched — up to a few hundred typically)
      const shipmentIdByOrder = new Map();
      if (parsed.shipments.length > 0) {
        const total = parsed.shipments.length;
        for (let i = 0; i < total; i += 500) {
          setSaveProgress(`Saving shipments ${i + 1}–${Math.min(i + 500, total)} of ${total}…`);
          const batch = parsed.shipments.slice(i, i + 500).map(s => ({ ...s, org_id: orgId, invoice_id: invoiceId, provider_id: provider.id }));
          const { data, error } = await supabase.from("wms_3pl_invoice_shipments").insert(batch).select("id, external_order_no");
          if (error) throw new Error(`Shipments batch ${i}: ${error.message}`);
          (data || []).forEach(s => { if (s.external_order_no) shipmentIdByOrder.set(s.external_order_no, s.id); });
        }
      }

      // 6. Insert order lines (potentially large — up to ~100K for Stord). Batch hard.
      if (parsed.orderLines.length > 0) {
        const total = parsed.orderLines.length;
        const BATCH = 500;
        for (let i = 0; i < total; i += BATCH) {
          setSaveProgress(`Saving order lines ${i + 1}–${Math.min(i + BATCH, total)} of ${total}…`);
          const batch = parsed.orderLines.slice(i, i + BATCH).map(ol => ({
            ...ol, org_id: orgId, invoice_id: invoiceId,
            shipment_id: ol.external_order_no ? shipmentIdByOrder.get(ol.external_order_no) || null : null,
          }));
          const { error } = await supabase.from("wms_3pl_invoice_order_lines").insert(batch);
          if (error) throw new Error(`Order lines batch ${i}: ${error.message}`);
        }
      }

      setSaveProgress("Done!");
      await loadData();
      setView("list");
      setParsed(null); setUploadFile(null); setOverrideProvider(null);
    } catch (e) {
      alert("Save failed: " + (e.message || String(e)));
    } finally {
      setSaving(false);
      setSaveProgress("");
    }
  };

  // ── Open invoice detail ──
  const openInvoice = async (inv) => {
    setSelectedInvoice(inv);
    setView("detail");
    setDetailTab("lines");
    const [lR, sR] = await Promise.all([
      supabase.from("wms_3pl_invoice_lines").select("*").eq("invoice_id", inv.id).order("line_no"),
      supabase.from("wms_3pl_invoice_shipments").select("id, shipment_date, external_order_no, carrier, service_level, freight_cost, weight_kg, zone, recipient_region, recipient_country, units_shipped").eq("invoice_id", inv.id).order("shipment_date", { ascending: false }).limit(500),
    ]);
    setDetailLines(lR.data || []);
    setDetailShipments(sR.data || []);
  };

  // ── Update invoice status ──
  const updateStatus = async (status) => {
    if (!selectedInvoice) return;
    const patch = { status };
    if (status === "approved") { patch.approved_at = new Date().toISOString(); patch.approved_by = user?.id; }
    if (status === "paid") patch.paid_at = new Date().toISOString();
    const { error } = await supabase.from("wms_3pl_invoices").update(patch).eq("id", selectedInvoice.id);
    if (error) { alert("Update failed: " + error.message); return; }
    setSelectedInvoice({ ...selectedInvoice, ...patch });
    setInvoices(prev => prev.map(i => i.id === selectedInvoice.id ? { ...i, ...patch } : i));
  };

  // ── Styles ──
  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 };
  const btn = { padding: "8px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 };
  const btnPrimary = { ...btn, background: T.accent, color: "#fff" };
  const btnGhost = { ...btn, background: T.surface2, color: T.text2, border: `1px solid ${T.border}` };

  // Filter invoices
  const filteredInvoices = filterProvider ? invoices.filter(i => providers.find(p => p.id === i.provider_id)?.code === filterProvider) : invoices;

  // KPI calcs for list view
  const kpis = (() => {
    const total = filteredInvoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const draft = filteredInvoices.filter(i => i.status === "draft").length;
    const unpaid = filteredInvoices.filter(i => i.status !== "paid" && i.status !== "void").reduce((s, i) => s + (Number(i.total) || 0), 0);
    return { total, draft, unpaid, count: filteredInvoices.length };
  })();

  if (loading) return <div style={{ padding: 24, color: T.text3 }}>Loading 3PL billing…</div>;

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: "0 auto" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>🚚 3PL Billing</div>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>Upload, audit and analyze invoices from all 3PL partners</div>
        </div>
        {view === "list" && (
          <button onClick={() => { setView("upload"); setParsed(null); setUploadFile(null); setOverrideProvider(null); setParseError(null); }} style={btnPrimary}>＋ Upload Invoice</button>
        )}
        {view !== "list" && (
          <button onClick={() => { setView("list"); setSelectedInvoice(null); setParsed(null); setUploadFile(null); }} style={btnGhost}>← Back to list</button>
        )}
      </div>

      {/* ── LIST view ── */}
      {view === "list" && (
        <>
          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
            <div style={card}><div style={{ fontSize: 10, color: T.text3, textTransform: "uppercase", fontWeight: 700 }}>Total Invoiced</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>${fmtCompact(kpis.total)}</div></div>
            <div style={card}><div style={{ fontSize: 10, color: T.text3, textTransform: "uppercase", fontWeight: 700 }}>Unpaid</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: "#F59E0B" }}>${fmtCompact(kpis.unpaid)}</div></div>
            <div style={card}><div style={{ fontSize: 10, color: T.text3, textTransform: "uppercase", fontWeight: 700 }}>Drafts (need review)</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: "#3B82F6" }}>{kpis.draft}</div></div>
            <div style={card}><div style={{ fontSize: 10, color: T.text3, textTransform: "uppercase", fontWeight: 700 }}>Invoices</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{kpis.count}</div></div>
          </div>

          {/* Provider filter */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            <button onClick={() => setFilterProvider("")} style={{ ...btn, background: filterProvider === "" ? T.accent : T.surface2, color: filterProvider === "" ? "#fff" : T.text3 }}>All</button>
            {providers.map(p => (
              <button key={p.code} onClick={() => setFilterProvider(p.code)} style={{ ...btn, background: filterProvider === p.code ? T.accent : T.surface2, color: filterProvider === p.code ? "#fff" : T.text3 }}>
                {PROVIDERS_META[p.code]?.flag} {p.name}
              </button>
            ))}
          </div>

          {/* Invoice table */}
          {filteredInvoices.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: 60, color: T.text3 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text2 }}>No invoices yet</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Click "Upload Invoice" to add your first one.</div>
            </div>
          ) : (
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${T.border}`, background: T.surface2 }}>
                    {["3PL", "Invoice #", "Period", "Currency", "Total", "Units", "Orders", "$/Unit", "Status"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map(inv => {
                    const prov = providers.find(p => p.id === inv.provider_id);
                    const meta = PROVIDERS_META[prov?.code];
                    const statusColors = { draft: "#94A3B8", reviewed: "#3B82F6", approved: "#10B981", paid: "#10B981", disputed: "#EF4444", void: "#6B7280" };
                    const cpu = inv.units_shipped ? Number(inv.total) / inv.units_shipped : null;
                    return (
                      <tr key={inv.id} onClick={() => openInvoice(inv)} style={{ borderBottom: `1px solid ${T.border}25`, cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background = T.surface2 + "60"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600 }}>{meta?.flag} {prov?.name || "—"}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12, fontFamily: "monospace" }}>{inv.invoice_number}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: T.text2 }}>{inv.period_start} → {inv.period_end}</td>
                        <td style={{ padding: "10px 12px", fontSize: 11, color: T.text3 }}>{inv.currency}</td>
                        <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>{fmtCurrency(Number(inv.total), inv.currency)}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: T.text2, fontFamily: "monospace" }}>{inv.units_shipped?.toLocaleString() || "—"}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: T.text2, fontFamily: "monospace" }}>{inv.orders_shipped?.toLocaleString() || "—"}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: T.text2, fontFamily: "monospace" }}>{cpu ? fmtCurrency(cpu, inv.currency) : "—"}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: (statusColors[inv.status] || T.text3) + "20", color: statusColors[inv.status] || T.text3, textTransform: "uppercase" }}>{inv.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── UPLOAD view ── */}
      {view === "upload" && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Upload an invoice file</div>
          <div style={{ fontSize: 12, color: T.text3, marginBottom: 16 }}>
            Supported: Next3PL (UK/AU/CA) <code>.xlsm</code>/<code>.xlsx</code> with Warehouse Rates sheet, Stord <code>_CUSTOMER.xlsx</code> + <code>consolidated-transaction-report.xlsx</code>. Format auto-detected from sheet structure.
          </div>
          <div onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            style={{ border: `2px dashed ${T.border}`, borderRadius: 12, padding: 50, textAlign: "center", cursor: "pointer", background: T.surface2 + "40" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📁</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text2 }}>{parsing ? "Parsing…" : "Drop a file here, or click to select"}</div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 6 }}>xlsx / xlsm / xls</div>
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm,.xls,.csv" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} style={{ display: "none" }} />
          {parseError && <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "#EF444418", color: "#EF4444", fontSize: 12 }}>⚠ {parseError}</div>}
        </div>
      )}

      {/* ── REVIEW view (after parse) ── */}
      {view === "review" && parsed && (
        <>
          {/* Detection banner */}
          <div style={{ ...card, marginBottom: 12, background: T.accent + "10", borderColor: T.accent }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: T.text3, textTransform: "uppercase", fontWeight: 700 }}>Detected Format</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{parsed.detected_format}</div>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginRight: 8 }}>Provider:</label>
                <select value={overrideProvider || ""} onChange={e => setOverrideProvider(e.target.value)}
                  style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12 }}>
                  <option value="">— select —</option>
                  {providers.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Header summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
            <div style={card}><div style={{ fontSize: 10, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>Invoice #</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, fontFamily: "monospace" }}>{parsed.header.invoice_number || "—"}</div></div>
            <div style={card}><div style={{ fontSize: 10, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>Period</div><div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>{parsed.header.period_start} → {parsed.header.period_end}</div></div>
            <div style={card}><div style={{ fontSize: 10, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>Total</div><div style={{ fontSize: 16, fontWeight: 800, marginTop: 4, fontFamily: "monospace" }}>{fmtCurrency(parsed.header.total, parsed.header.currency)}</div></div>
            <div style={card}><div style={{ fontSize: 10, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>Lines</div><div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{parsed.lines.length}</div></div>
            <div style={card}><div style={{ fontSize: 10, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>Shipments</div><div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{parsed.shipments.length.toLocaleString()}</div></div>
            <div style={card}><div style={{ fontSize: 10, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>Order Lines</div><div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{parsed.orderLines.length.toLocaleString()}</div></div>
          </div>

          {/* Lines preview + category override */}
          <div style={{ ...card, padding: 0, marginBottom: 12, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 12, fontWeight: 700, background: T.surface2 }}>Line items ({parsed.lines.length}) — review categories</div>
            <div style={{ maxHeight: 400, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: T.surface, zIndex: 1 }}>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    {["Category", "Description", "Rate", "Qty", "Amount"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", textAlign: h === "Amount" || h === "Rate" || h === "Qty" ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.lines.map((l, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.border}15` }}>
                      <td style={{ padding: "5px 10px" }}>
                        <select value={l.canonical_category}
                          onChange={e => setParsed(p => ({ ...p, lines: p.lines.map((line, idx) => idx === i ? { ...line, canonical_category: e.target.value } : line) }))}
                          style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4, border: `1px solid ${T.border}`, background: (CATEGORY_BY_KEY[l.canonical_category]?.color || T.text3) + "20", color: CATEGORY_BY_KEY[l.canonical_category]?.color || T.text3, fontWeight: 600, cursor: "pointer" }}>
                          {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: "5px 10px", fontSize: 11 }}>{l.description}{l.notes ? <span style={{ color: T.text3, fontSize: 10 }}> — {l.notes}</span> : ""}</td>
                      <td style={{ padding: "5px 10px", fontSize: 11, textAlign: "right", fontFamily: "monospace", color: T.text3 }}>{(l.rate || 0).toFixed(4)}</td>
                      <td style={{ padding: "5px 10px", fontSize: 11, textAlign: "right", fontFamily: "monospace", color: T.text3 }}>{(l.quantity || 0).toLocaleString()}</td>
                      <td style={{ padding: "5px 10px", fontSize: 11, textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>{fmtCurrency(l.amount, parsed.header.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Save controls */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
            {saving && <span style={{ fontSize: 11, color: T.text3 }}>{saveProgress}</span>}
            <button onClick={() => { setView("upload"); setParsed(null); }} style={btnGhost} disabled={saving}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !overrideProvider} style={{ ...btnPrimary, opacity: (saving || !overrideProvider) ? 0.5 : 1, cursor: saving || !overrideProvider ? "not-allowed" : "pointer" }}>
              {saving ? "Saving…" : `Save invoice (${(parsed.lines.length + parsed.shipments.length + parsed.orderLines.length).toLocaleString()} rows)`}
            </button>
          </div>
        </>
      )}

      {/* ── DETAIL view ── */}
      {view === "detail" && selectedInvoice && (() => {
        const prov = providers.find(p => p.id === selectedInvoice.provider_id);
        const meta = PROVIDERS_META[prov?.code];
        const lineByCategory = {};
        detailLines.forEach(l => { lineByCategory[l.canonical_category] = (lineByCategory[l.canonical_category] || 0) + Number(l.amount || 0); });
        const sortedCats = Object.entries(lineByCategory).sort((a, b) => b[1] - a[1]);
        return (
          <>
            {/* Header card */}
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>{meta?.flag} {prov?.name} · Invoice {selectedInvoice.invoice_number}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, fontFamily: "monospace" }}>{fmtCurrency(Number(selectedInvoice.total), selectedInvoice.currency)}</div>
                  <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>{selectedInvoice.period_start} → {selectedInvoice.period_end} · {selectedInvoice.units_shipped?.toLocaleString() || 0} units / {selectedInvoice.orders_shipped?.toLocaleString() || 0} orders</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
                  {["draft", "reviewed", "approved", "paid", "disputed"].map(s => (
                    <button key={s} onClick={() => updateStatus(s)} style={{ ...btn, background: selectedInvoice.status === s ? T.accent : T.surface2, color: selectedInvoice.status === s ? "#fff" : T.text3, textTransform: "uppercase", fontSize: 10 }}>{s}</button>
                  ))}
                  {selectedInvoice.source_file_url && (
                    <a href={selectedInvoice.source_file_url} target="_blank" rel="noopener noreferrer" style={{ ...btnGhost, textDecoration: "none", display: "inline-block" }}>📎 Source File</a>
                  )}
                </div>
              </div>
            </div>

            {/* Category breakdown */}
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 10 }}>Cost breakdown by category</div>
              {sortedCats.map(([cat, amt]) => {
                const pct = (amt / Number(selectedInvoice.total || 1)) * 100;
                const meta = CATEGORY_BY_KEY[cat];
                return (
                  <div key={cat} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: meta?.color, fontWeight: 700 }}>{meta?.label || cat}</span>
                      <span style={{ fontFamily: "monospace" }}>{fmtCurrency(amt, selectedInvoice.currency)} <span style={{ color: T.text3 }}>({pct.toFixed(1)}%)</span></span>
                    </div>
                    <div style={{ height: 6, background: T.surface2, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: meta?.color || T.text3 }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, marginBottom: 8 }}>
              {[["lines", `Line items (${detailLines.length})`], ["shipments", `Shipments (${detailShipments.length})`]].map(([k, l]) => (
                <button key={k} onClick={() => setDetailTab(k)} style={{ padding: "8px 16px", background: "none", border: "none", borderBottom: detailTab === k ? `2px solid ${T.accent}` : "none", color: detailTab === k ? T.accent : T.text3, fontWeight: detailTab === k ? 700 : 500, cursor: "pointer", fontSize: 12 }}>{l}</button>
              ))}
            </div>

            {detailTab === "lines" && (
              <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ background: T.surface2 }}>
                    <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                      {["Category", "Description", "UoM", "Rate", "Qty", "Amount"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", textAlign: ["Rate","Qty","Amount"].includes(h) ? "right" : "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detailLines.map(l => {
                      const meta = CATEGORY_BY_KEY[l.canonical_category];
                      return (
                        <tr key={l.id} style={{ borderBottom: `1px solid ${T.border}15` }}>
                          <td style={{ padding: "7px 12px" }}><span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: (meta?.color || T.text3) + "20", color: meta?.color || T.text3, fontWeight: 700 }}>{meta?.label || l.canonical_category}</span></td>
                          <td style={{ padding: "7px 12px", fontSize: 12 }}>{l.description}{l.notes ? <span style={{ color: T.text3, fontSize: 10 }}> — {l.notes}</span> : ""}</td>
                          <td style={{ padding: "7px 12px", fontSize: 11, color: T.text3 }}>{l.uom}</td>
                          <td style={{ padding: "7px 12px", fontSize: 12, textAlign: "right", fontFamily: "monospace", color: T.text3 }}>{Number(l.rate || 0).toFixed(4)}</td>
                          <td style={{ padding: "7px 12px", fontSize: 12, textAlign: "right", fontFamily: "monospace", color: T.text3 }}>{Number(l.quantity || 0).toLocaleString()}</td>
                          <td style={{ padding: "7px 12px", fontSize: 12, textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>{fmtCurrency(Number(l.amount), selectedInvoice.currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === "shipments" && (
              <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ background: T.surface2 }}>
                    <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                      {["Date", "Order", "Carrier", "Service", "Zone", "Wt (kg)", "Region", "Cost"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", textAlign: h === "Cost" || h === "Wt (kg)" ? "right" : "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detailShipments.map(s => (
                      <tr key={s.id} style={{ borderBottom: `1px solid ${T.border}15` }}>
                        <td style={{ padding: "6px 12px", fontSize: 11, color: T.text2 }}>{s.shipment_date}</td>
                        <td style={{ padding: "6px 12px", fontSize: 11, fontFamily: "monospace" }}>{s.external_order_no}</td>
                        <td style={{ padding: "6px 12px", fontSize: 11 }}>{s.carrier}</td>
                        <td style={{ padding: "6px 12px", fontSize: 11, color: T.text3 }}>{s.service_level}</td>
                        <td style={{ padding: "6px 12px", fontSize: 11, color: T.text3 }}>{s.zone}</td>
                        <td style={{ padding: "6px 12px", fontSize: 11, textAlign: "right", fontFamily: "monospace", color: T.text3 }}>{s.weight_kg ? Number(s.weight_kg).toFixed(3) : "—"}</td>
                        <td style={{ padding: "6px 12px", fontSize: 11, color: T.text3 }}>{[s.recipient_region, s.recipient_country].filter(Boolean).join(", ")}</td>
                        <td style={{ padding: "6px 12px", fontSize: 11, textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>{fmtCurrency(Number(s.freight_cost || 0), selectedInvoice.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detailShipments.length === 500 && <div style={{ padding: 8, textAlign: "center", fontSize: 11, color: T.text3 }}>Showing first 500 shipments</div>}
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
