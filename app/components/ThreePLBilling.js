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
function detectFormat(workbook, filename = "", _xlsxRef = null) {
  const sheets = workbook.SheetNames.map(s => s.toLowerCase());
  const fn = filename.toLowerCase();

  // Stord consolidated transaction report
  if (sheets.includes("parcel txns") || sheets.includes("parcel backup report") || sheets.includes("parcel backup summary")) {
    return { format: "stord_consolidated", provider: "stord_us" };
  }
  // ── Stord customer billing ──
  // Variant A (classic): sheets "Billing Summary" + "OB Lines" / "IB LPNs" / "VAS"
  // Variant B (D1RT-style): sheet "<code> INVOICE" + optionally "LPN" / "VAS"
  // Detect by content rather than name: any sheet whose first ~10 rows contain
  // "Item" + "Rate" + "Total" as adjacent header tokens.
  const detectStordCustomerSheet = () => {
    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      if (!ws) continue;
      const rows = sheetToRows(ws, _xlsxRef);
      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const cells = (rows[r] || []).map(c => String(c || "").trim().toLowerCase());
        const hasItem = cells.includes("item");
        const hasRate = cells.includes("rate");
        const hasTotal = cells.includes("total");
        const hasQty = cells.some(c => c === "qty" || c === "quantity");
        if (hasItem && hasRate && hasTotal && hasQty) {
          return { sheetName, headerRow: r, cells };
        }
      }
    }
    return null;
  };
  const stordHit = detectStordCustomerSheet();
  if (stordHit) {
    // Try to grab a warehouse code from row 1 of that sheet OR the filename.
    // Accept any 3-letter alpha code optionally followed by 1-2 digits (airport-style).
    const ws = workbook.Sheets[stordHit.sheetName];
    const headerCell = String(ws?.["A1"]?.v || "");
    const whFromHeader = headerCell.match(/\b([A-Z]{3}\d{0,2})\b/);
    const whFromFile = filename.match(/[_\-\s]([A-Z]{3}\d{0,2})[_\-\s]/i);
    const warehouse = (whFromHeader?.[1] || whFromFile?.[1] || "").toUpperCase() || null;
    return { format: "stord_customer", provider: "stord_us", warehouse, stordHit };
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

  // ── Locate the invoice sheet ──
  // Classic variant: a sheet literally named "Billing Summary".
  // D1RT variant: a sheet named "<code> INVOICE".
  // We trust the detection result if it told us the sheet name; otherwise
  // we scan every sheet for the "Item ... Rate ... Total" header signature.
  const findInvoiceSheet = () => {
    if (hint.stordHit && workbook.Sheets[hint.stordHit.sheetName]) {
      return { name: hint.stordHit.sheetName, headerRow: hint.stordHit.headerRow };
    }
    // Fallback scan
    for (const name of workbook.SheetNames) {
      const ws = workbook.Sheets[name];
      if (!ws) continue;
      const rows = sheetToRows(ws, xlsx);
      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const lc = (rows[r] || []).map(c => String(c || "").trim().toLowerCase());
        if (lc.includes("item") && lc.includes("rate") && lc.includes("total") && (lc.includes("qty") || lc.includes("quantity"))) {
          return { name, headerRow: r };
        }
      }
    }
    // Legacy literal fallback
    const legacy = workbook.SheetNames.find(s => /billing summary/i.test(s));
    return legacy ? { name: legacy, headerRow: null } : null;
  };
  const invSheet = findInvoiceSheet();
  const wsSum = invSheet ? workbook.Sheets[invSheet.name] : null;
  if (wsSum) {
    const rows = sheetToRows(wsSum, xlsx);

    // Period extraction: scan the first ~8 rows for a "Month D1-D2, YYYY" pattern
    // in any column. Classic puts it at A2; D1RT may have a slightly different layout.
    for (let r = 0; r < Math.min(rows.length, 8); r++) {
      const joined = (rows[r] || []).map(c => String(c || "")).join(" ");
      const m = joined.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*-\s*(\d{1,2}),?\s+(\d{4})/i);
      if (m) {
        const monthIdx = ["january","february","march","april","may","june","july","august","september","october","november","december"].indexOf(m[1].toLowerCase());
        if (monthIdx >= 0) {
          const yr = +m[4];
          result.header.period_start = new Date(yr, monthIdx, +m[2]).toISOString().split("T")[0];
          result.header.period_end = new Date(yr, monthIdx, +m[3]).toISOString().split("T")[0];
          result.header.invoice_date = result.header.period_end;
        }
        break;
      }
    }

    // Locate the column offset of the line-items header dynamically.
    // We look for a row where "Item", "Rate", "Total" are all present and capture
    // each token''s column index so the parser is offset-agnostic.
    let cols = null;
    const startRow = invSheet.headerRow != null ? invSheet.headerRow : 0;
    for (let r = startRow; r < Math.min(rows.length, 20); r++) {
      const cells = (rows[r] || []).map(c => String(c || "").trim());
      const lc = cells.map(c => c.toLowerCase());
      const cItem = lc.indexOf("item");
      const cRate = lc.indexOf("rate");
      const cTotal = lc.indexOf("total");
      const cQty = lc.findIndex(c => c === "qty" || c === "quantity");
      // Memo/UoM is the column between Item and Rate (if present)
      if (cItem >= 0 && cRate > cItem && cTotal > cRate && cQty > cItem) {
        const cMemo = cRate > cItem + 1 ? cItem + 1 : -1;
        cols = { item: cItem, memo: cMemo, rate: cRate, qty: cQty, total: cTotal, headerAt: r };
        break;
      }
    }

    if (cols) {
      let lineNo = 0;
      for (let i = cols.headerAt + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const cells = row.map(c => c == null ? "" : String(c).trim());
        // INVOICE TOTAL or final "TOTAL" marker — pick the first sizable number from the row
        const looksLikeTotal = cells.some(c => /^(invoice\s+)?total$/i.test(c));
        if (looksLikeTotal) {
          for (const c of row) {
            const n = num(c);
            if (n > 100) { result.header.total = n; result.header.subtotal = n; break; }
          }
          continue;
        }
        const item = cells[cols.item];
        const rate = num(row[cols.rate]);
        const qty = num(row[cols.qty]);
        const total = num(row[cols.total]);
        if (!item || item.toLowerCase() === "item") continue;
        if (total === 0 && qty === 0) continue;
        const uom = cols.memo >= 0 ? (cells[cols.memo] || null) : null;
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

  // ── LPN sheet (inbound receiving data — D1RT variant) ──
  // We don''t treat LPN rows as outbound shipments. If we still don''t have
  // a warehouse_code, pull it from the LPN "Building Name" column.
  if (!result.header.warehouse_code) {
    const wsLPN = workbook.Sheets[workbook.SheetNames.find(s => /^lpn$/i.test(s) || /^ib lpns$/i.test(s))];
    if (wsLPN) {
      const rows = sheetToRows(wsLPN, xlsx);
      if (rows.length > 1) {
        const header = (rows[0] || []).map(c => String(c || "").toLowerCase());
        const idxBld = header.findIndex(c => /building name/i.test(c));
        if (idxBld >= 0) {
          for (let i = 1; i < Math.min(rows.length, 20); i++) {
            const bld = rows[i]?.[idxBld];
            if (bld) {
              const m = String(bld).match(/\b([A-Z]{3}\d{0,2}s?\d*)\b/);
              if (m) { result.header.warehouse_code = m[1].toUpperCase().replace(/S\d+$/i, ""); break; }
            }
          }
        }
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
  const detection = detectFormat(workbook, filename, xlsx);
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

  // Upload + review state — queue-based to support multi-file + folder imports
  // Each queue item:
  //   { id, file, name, status: "parsing"|"ready"|"error"|"saving"|"saved"|"skipped",
  //     header, lines, shipments, orderLines, detected_format,
  //     overrideProvider, error, savedInvoiceId, progress }
  const [parsedQueue, setParsedQueue] = useState([]);
  const [parseProgress, setParseProgress] = useState({ done: 0, total: 0 });
  const [activeQueueId, setActiveQueueId] = useState(null); // which queue item is expanded in detail
  const [savingAll, setSavingAll] = useState(false);
  const [filterProvider, setFilterProvider] = useState("");

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const queueIdSeq = useRef(0);
  const newQueueId = () => `q${++queueIdSeq.current}-${Date.now()}`;

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

  // ── File upload + parse (queue-based) ──
  // Map detected format → provider code (used to auto-select on first parse)
  const PROV_BY_FMT = {
    next3pl_uk_monthly: "next3pl_uk",
    next3pl_au_warehouse: "next3pl_au",
    next3pl_au_transport: "next3pl_au",
    next3pl_ca_weekly: "next3pl_ca",
    stord_customer: "stord_us",
    stord_consolidated: "stord_us",
  };

  // Filter for spreadsheet files we know how to parse. Anything else is silently
  // dropped — folders frequently contain PDFs, READMEs, .DS_Store, etc.
  const isParseableFile = (file) => {
    if (!file || !file.name) return false;
    const ext = file.name.toLowerCase().split(".").pop();
    return ["xlsx", "xlsm", "xls", "csv"].includes(ext);
  };

  // Recursively flatten a DataTransferItem entry (from drag-drop) into a flat
  // array of File objects. Browsers expose folders only via webkitGetAsEntry().
  const flattenEntry = async (entry, path = "") => {
    if (!entry) return [];
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((f) => {
          // Re-create File with a relative-path hint stored on `.webkitRelativePath`
          // (some browsers don''t populate it for dragged items, so we attach it on a wrapper).
          try { Object.defineProperty(f, "webkitRelativePath", { value: path + f.name, configurable: true }); } catch (e) {}
          resolve([f]);
        }, () => resolve([]));
      });
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const allEntries = [];
      // readEntries() returns at most ~100 entries per call; loop until empty
      while (true) {
        const batch = await new Promise((resolve) => reader.readEntries(resolve, () => resolve([])));
        if (!batch.length) break;
        allEntries.push(...batch);
      }
      const nested = await Promise.all(allEntries.map(e => flattenEntry(e, path + entry.name + "/")));
      return nested.flat();
    }
    return [];
  };

  // Extract files from a DragEvent — supports both individual files and folders.
  const filesFromDropEvent = async (e) => {
    const items = e.dataTransfer?.items;
    if (items && items.length && items[0].webkitGetAsEntry) {
      const entries = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
      const nested = await Promise.all(entries.map(en => flattenEntry(en)));
      return nested.flat();
    }
    // Fallback: just files, no folder support
    return Array.from(e.dataTransfer?.files || []);
  };

  // Parse one file → return a queue item shape (does NOT mutate state).
  const parseOne = async (file, xlsx) => {
    const id = newQueueId();
    try {
      const buf = await file.arrayBuffer();
      const wb = xlsx.read(buf, { type: "array", cellDates: true });
      const result = parseInvoice(wb, xlsx, file.name);
      if (result.error) throw new Error(result.error);
      return {
        id, file, name: file.webkitRelativePath || file.name,
        status: "ready",
        header: result.header, lines: result.lines, shipments: result.shipments, orderLines: result.orderLines,
        detected_format: result.detected_format,
        overrideProvider: PROV_BY_FMT[result.detected_format] || null,
        error: null, savedInvoiceId: null, progress: "",
      };
    } catch (e) {
      return {
        id, file, name: file.webkitRelativePath || file.name,
        status: "error",
        header: {}, lines: [], shipments: [], orderLines: [],
        detected_format: null, overrideProvider: null,
        error: e.message || String(e), savedInvoiceId: null, progress: "",
      };
    }
  };

  // Public entry point: pass a FileList / File[] / DataTransfer items → parse
  // each in parallel, then append all to the queue. Switches to review view.
  const handleFiles = async (filesIn) => {
    const files = Array.from(filesIn || []).filter(isParseableFile);
    if (!files.length) return;
    setParseProgress({ done: 0, total: files.length });
    setView("review");
    const xlsx = await loadSheetJS();
    // Parse in parallel but track completion for progress UI
    let done = 0;
    const results = await Promise.all(files.map(async (f) => {
      const r = await parseOne(f, xlsx);
      done++;
      setParseProgress({ done, total: files.length });
      return r;
    }));
    setParsedQueue(prev => {
      const merged = [...prev, ...results];
      // Auto-expand the first new item if nothing is currently active
      if (!activeQueueId && merged.length > 0) {
        const firstReady = results.find(r => r.status === "ready");
        if (firstReady) setActiveQueueId(firstReady.id);
      }
      return merged;
    });
    setParseProgress({ done: 0, total: 0 });
  };

  // Update a single field on a queue item (immutable patch)
  const patchQueueItem = (id, patch) => {
    setParsedQueue(prev => prev.map(it => it.id === id ? { ...it, ...(typeof patch === "function" ? patch(it) : patch) } : it));
  };

  // ── Save ONE queue item to DB ──
  // Returns true on success, false on failure (caller decides what to do).
  const saveOne = async (item) => {
    if (!item || item.status === "saved" || item.status === "skipped") return true;
    if (!item.overrideProvider) {
      patchQueueItem(item.id, { error: "Provider not selected — pick one before saving." });
      return false;
    }
    const provider = providers.find(p => p.code === item.overrideProvider);
    if (!provider) {
      patchQueueItem(item.id, { error: "Provider not found in DB. Re-seed wms_3pl_providers." });
      return false;
    }
    patchQueueItem(item.id, { status: "saving", error: null, progress: "Starting…" });
    try {
      // 1. Upload original file to Supabase Storage for audit
      patchQueueItem(item.id, { progress: "Uploading source file…" });
      const path = `${orgId}/3pl-invoices/${provider.code}/${Date.now()}-${item.file.name}`;
      let sourceUrl = null;
      try {
        const { data: upR } = await supabase.storage.from("bill-attachments").upload(path, item.file, { upsert: true });
        if (upR?.path) sourceUrl = supabase.storage.from("bill-attachments").getPublicUrl(upR.path).data.publicUrl;
      } catch (e) { console.warn("Storage upload failed (continuing without file):", e.message); }

      // 2. Insert invoice header
      patchQueueItem(item.id, { progress: "Saving invoice header…" });
      const header = item.header;
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
        source_file_name: item.file.name,
        source_file_type: item.file.name.split(".").pop().toLowerCase(),
        source_format: item.detected_format,
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
      patchQueueItem(item.id, { progress: `Saving ${item.lines.length} line items…` });
      if (item.lines.length > 0) {
        const payload = item.lines.map(l => ({ ...l, org_id: orgId, invoice_id: invoiceId }));
        const { error } = await supabase.from("wms_3pl_invoice_lines").insert(payload);
        if (error) throw new Error("Lines: " + error.message);
      }

      // 5. Insert shipments (batched — up to a few hundred typically)
      const shipmentIdByOrder = new Map();
      if (item.shipments.length > 0) {
        const total = item.shipments.length;
        for (let i = 0; i < total; i += 500) {
          patchQueueItem(item.id, { progress: `Saving shipments ${i + 1}–${Math.min(i + 500, total)} of ${total}…` });
          const batch = item.shipments.slice(i, i + 500).map(s => ({ ...s, org_id: orgId, invoice_id: invoiceId, provider_id: provider.id }));
          const { data, error } = await supabase.from("wms_3pl_invoice_shipments").insert(batch).select("id, external_order_no");
          if (error) throw new Error(`Shipments batch ${i}: ${error.message}`);
          (data || []).forEach(s => { if (s.external_order_no) shipmentIdByOrder.set(s.external_order_no, s.id); });
        }
      }

      // 6. Insert order lines (potentially large — up to ~100K for Stord). Batch hard.
      if (item.orderLines.length > 0) {
        const total = item.orderLines.length;
        const BATCH = 500;
        for (let i = 0; i < total; i += BATCH) {
          patchQueueItem(item.id, { progress: `Saving order lines ${i + 1}–${Math.min(i + BATCH, total)} of ${total}…` });
          const batch = item.orderLines.slice(i, i + BATCH).map(ol => ({
            ...ol, org_id: orgId, invoice_id: invoiceId,
            shipment_id: ol.external_order_no ? shipmentIdByOrder.get(ol.external_order_no) || null : null,
          }));
          const { error } = await supabase.from("wms_3pl_invoice_order_lines").insert(batch);
          if (error) throw new Error(`Order lines batch ${i}: ${error.message}`);
        }
      }

      patchQueueItem(item.id, { status: "saved", progress: "Done", savedInvoiceId: invoiceId, error: null });
      return true;
    } catch (e) {
      patchQueueItem(item.id, { status: "error", progress: "", error: e.message || String(e) });
      return false;
    }
  };

  // ── Save every "ready" item in the queue ──
  const handleSaveAll = async () => {
    const toSave = parsedQueue.filter(it => it.status === "ready" && it.overrideProvider);
    if (!toSave.length) return;
    setSavingAll(true);
    for (const it of toSave) {
      // Re-read latest item from state each iteration so any in-flight UI edits
      // (category overrides, provider changes) flow into the save.
      const latest = await new Promise(resolve => {
        setParsedQueue(prev => { resolve(prev.find(p => p.id === it.id) || it); return prev; });
      });
      await saveOne(latest);
    }
    setSavingAll(false);
    await loadData();
  };

  // ── Skip / remove a queue item ──
  const skipQueueItem = (id) => {
    patchQueueItem(id, { status: "skipped", error: null, progress: "" });
    if (activeQueueId === id) {
      const remaining = parsedQueue.filter(it => it.id !== id && it.status === "ready");
      setActiveQueueId(remaining[0]?.id || null);
    }
  };

  // ── Clear queue + return to list ──
  const resetQueue = () => {
    setParsedQueue([]); setActiveQueueId(null); setParseProgress({ done: 0, total: 0 });
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
          <button onClick={() => { resetQueue(); setView("upload"); }} style={btnPrimary}>＋ Upload Invoices</button>
        )}
        {view !== "list" && (
          <button onClick={() => { setView("list"); setSelectedInvoice(null); resetQueue(); }} style={btnGhost}>← Back to list</button>
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
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Upload invoice files</div>
          <div style={{ fontSize: 12, color: T.text3, marginBottom: 16 }}>
            Drop one file, several files, or an entire folder. Format auto-detects per file. Supported: Next3PL (UK/AU/CA) <code>.xlsm</code>/<code>.xlsx</code>, Stord <code>_CUSTOMER.xlsx</code> + <code>consolidated-transaction-report.xlsx</code>.
          </div>
          <div
            onDrop={async (e) => { e.preventDefault(); const files = await filesFromDropEvent(e); if (files.length) handleFiles(files); }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            style={{ border: `2px dashed ${T.border}`, borderRadius: 12, padding: 50, textAlign: "center", cursor: "pointer", background: T.surface2 + "40" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📁</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text2 }}>Drop files or a folder here</div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 6 }}>xlsx · xlsm · xls · csv · folders scanned recursively</div>
          </div>
          <input ref={fileInputRef} type="file" multiple accept=".xlsx,.xlsm,.xls,.csv"
            onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) handleFiles(fs); e.target.value = ""; }}
            style={{ display: "none" }} />
          <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple
            onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) handleFiles(fs); e.target.value = ""; }}
            style={{ display: "none" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
            <button onClick={() => fileInputRef.current?.click()} style={btnGhost}>Select files…</button>
            <button onClick={() => folderInputRef.current?.click()} style={btnGhost}>Select folder…</button>
          </div>
        </div>
      )}

      {/* ── REVIEW view (queue) ── */}
      {view === "review" && (
        <>
          {/* Parse progress + add-more controls */}
          <div style={{ ...card, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                {parseProgress.total > 0 ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text2 }}>Parsing {parseProgress.done} / {parseProgress.total}…</div>
                    <div style={{ height: 6, background: T.surface2, borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(parseProgress.done / Math.max(1, parseProgress.total)) * 100}%`, background: T.accent, transition: "width 0.2s" }} />
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text2 }}>
                      {parsedQueue.length} file{parsedQueue.length === 1 ? "" : "s"} parsed
                      {(() => {
                        const ready = parsedQueue.filter(i => i.status === "ready").length;
                        const errored = parsedQueue.filter(i => i.status === "error").length;
                        const saved = parsedQueue.filter(i => i.status === "saved").length;
                        const skipped = parsedQueue.filter(i => i.status === "skipped").length;
                        const parts = [];
                        if (ready) parts.push(`${ready} ready`);
                        if (saved) parts.push(`${saved} saved`);
                        if (errored) parts.push(`${errored} error`);
                        if (skipped) parts.push(`${skipped} skipped`);
                        return parts.length ? ` — ${parts.join(" · ")}` : "";
                      })()}
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>Click a file to review its line items. Save All processes every "ready" invoice in sequence.</div>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => fileInputRef.current?.click()} style={btnGhost} disabled={savingAll}>＋ Add files</button>
                <button onClick={() => folderInputRef.current?.click()} style={btnGhost} disabled={savingAll}>＋ Add folder</button>
                <button onClick={handleSaveAll} disabled={savingAll || !parsedQueue.some(i => i.status === "ready" && i.overrideProvider)}
                  style={{ ...btnPrimary, opacity: (savingAll || !parsedQueue.some(i => i.status === "ready" && i.overrideProvider)) ? 0.5 : 1 }}>
                  {savingAll ? "Saving…" : `Save All (${parsedQueue.filter(i => i.status === "ready" && i.overrideProvider).length})`}
                </button>
              </div>
            </div>
            <input ref={fileInputRef} type="file" multiple accept=".xlsx,.xlsm,.xls,.csv"
              onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) handleFiles(fs); e.target.value = ""; }}
              style={{ display: "none" }} />
            <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple
              onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) handleFiles(fs); e.target.value = ""; }}
              style={{ display: "none" }} />
          </div>

          {/* Queue list */}
          <div style={{ ...card, padding: 0, marginBottom: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${T.border}`, background: T.surface2 }}>
                  {["File", "Format", "Provider", "Period", "Total", "Lines", "Ship.", "Order Lines", "Status", ""].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedQueue.map(it => {
                  const isActive = it.id === activeQueueId;
                  const statusColors = { ready: "#3B82F6", saving: "#F59E0B", saved: "#10B981", error: "#EF4444", skipped: "#6B7280" };
                  const c = statusColors[it.status] || T.text3;
                  return (
                    <tr key={it.id}
                      onClick={() => { if (it.status === "ready" || it.status === "saved") setActiveQueueId(isActive ? null : it.id); }}
                      style={{ borderBottom: `1px solid ${T.border}25`, cursor: (it.status === "ready" || it.status === "saved") ? "pointer" : "default", background: isActive ? T.accent + "10" : "transparent" }}>
                      <td style={{ padding: "8px 10px", fontSize: 11, fontFamily: "monospace", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.name}>{it.name}</td>
                      <td style={{ padding: "8px 10px", fontSize: 10, color: T.text3 }}>{it.detected_format || "—"}</td>
                      <td style={{ padding: "8px 10px" }} onClick={(e) => e.stopPropagation()}>
                        <select value={it.overrideProvider || ""}
                          onChange={(e) => patchQueueItem(it.id, { overrideProvider: e.target.value || null })}
                          disabled={it.status === "saving" || it.status === "saved"}
                          style={{ padding: "3px 6px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 11 }}>
                          <option value="">— select —</option>
                          {providers.map(p => <option key={p.code} value={p.code}>{PROVIDERS_META[p.code]?.flag} {p.name}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: "8px 10px", fontSize: 10, color: T.text3 }}>{it.header.period_start || "—"}{it.header.period_end ? ` → ${it.header.period_end}` : ""}</td>
                      <td style={{ padding: "8px 10px", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{it.header.total ? fmtCurrency(it.header.total, it.header.currency) : "—"}</td>
                      <td style={{ padding: "8px 10px", fontSize: 11, fontFamily: "monospace", color: T.text2 }}>{it.lines.length}</td>
                      <td style={{ padding: "8px 10px", fontSize: 11, fontFamily: "monospace", color: T.text2 }}>{it.shipments.length.toLocaleString()}</td>
                      <td style={{ padding: "8px 10px", fontSize: 11, fontFamily: "monospace", color: T.text2 }}>{it.orderLines.length.toLocaleString()}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: c + "20", color: c, textTransform: "uppercase" }}>{it.status}</span>
                        {it.progress && it.status === "saving" && <div style={{ fontSize: 9, color: T.text3, marginTop: 2 }}>{it.progress}</div>}
                        {it.error && <div style={{ fontSize: 10, color: "#EF4444", marginTop: 2, maxWidth: 200 }} title={it.error}>⚠ {it.error.slice(0, 60)}{it.error.length > 60 ? "…" : ""}</div>}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        {it.status === "ready" && (
                          <>
                            <button onClick={() => saveOne(it).then(ok => ok && loadData())} disabled={!it.overrideProvider || savingAll}
                              style={{ ...btn, padding: "3px 8px", fontSize: 10, background: T.accent, color: "#fff", marginRight: 4, opacity: (!it.overrideProvider || savingAll) ? 0.5 : 1 }}>Save</button>
                            <button onClick={() => skipQueueItem(it.id)} disabled={savingAll}
                              style={{ ...btn, padding: "3px 8px", fontSize: 10, background: T.surface2, color: T.text3 }}>Skip</button>
                          </>
                        )}
                        {it.status === "error" && (
                          <button onClick={() => skipQueueItem(it.id)} style={{ ...btn, padding: "3px 8px", fontSize: 10, background: T.surface2, color: T.text3 }}>Dismiss</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {parsedQueue.length === 0 && parseProgress.total === 0 && (
              <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 12 }}>No files parsed yet. Use Add files / Add folder above.</div>
            )}
          </div>

          {/* Active item detail — line items review */}
          {(() => {
            const active = parsedQueue.find(it => it.id === activeQueueId);
            if (!active) return null;
            return (
              <div style={{ ...card, padding: 0, marginBottom: 12, overflow: "hidden", borderColor: T.accent }}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 12, fontWeight: 700, background: T.accent + "10", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontFamily: "monospace" }}>{active.name}</span>
                    {active.header.invoice_number && <span style={{ marginLeft: 12, color: T.text3, fontSize: 11 }}>#{active.header.invoice_number}</span>}
                  </div>
                  <button onClick={() => setActiveQueueId(null)} style={{ ...btn, padding: "2px 8px", fontSize: 10, background: "transparent", color: T.text3 }}>✕ Collapse</button>
                </div>
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
                      {active.lines.map((l, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${T.border}15` }}>
                          <td style={{ padding: "5px 10px" }}>
                            <select value={l.canonical_category}
                              disabled={active.status !== "ready"}
                              onChange={(e) => patchQueueItem(active.id, (cur) => ({ lines: cur.lines.map((line, idx) => idx === i ? { ...line, canonical_category: e.target.value } : line) }))}
                              style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4, border: `1px solid ${T.border}`, background: (CATEGORY_BY_KEY[l.canonical_category]?.color || T.text3) + "20", color: CATEGORY_BY_KEY[l.canonical_category]?.color || T.text3, fontWeight: 600, cursor: active.status === "ready" ? "pointer" : "default" }}>
                              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: "5px 10px", fontSize: 11 }}>{l.description}{l.notes ? <span style={{ color: T.text3, fontSize: 10 }}> — {l.notes}</span> : ""}</td>
                          <td style={{ padding: "5px 10px", fontSize: 11, textAlign: "right", fontFamily: "monospace", color: T.text3 }}>{(l.rate || 0).toFixed(4)}</td>
                          <td style={{ padding: "5px 10px", fontSize: 11, textAlign: "right", fontFamily: "monospace", color: T.text3 }}>{(l.quantity || 0).toLocaleString()}</td>
                          <td style={{ padding: "5px 10px", fontSize: 11, textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>{fmtCurrency(l.amount, active.header.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
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
