// Path-based URLs for the single-page app: helm.earthbreeze.com/scoreboard,
// /erp/demand-planning, /projects/p/<id>. The module key is the path's first
// segment with "_" written as "-".
export const MODULES = new Set([
  "dashboard", "projects", "okrs", "scorecard", "learning", "support", "scoreboard", "messages", "docs",
  "calendar", "calls", "campaigns", "plm", "erp", "wms", "3pl_billing", "finance", "spend_request",
  "automation", "reports", "people", "inbox", "activity", "settings", "ai-builder", "launches", "esign",
]);
export const slugOf = (key) => String(key || "").replace(/_/g, "-");
export const keyOf = (slug) => {
  const s = decodeURIComponent(String(slug || "")).toLowerCase();
  if (MODULES.has(s)) return s;
  const k = s.replace(/-/g, "_");
  return MODULES.has(k) ? k : null;
};
// { module, sub, deep: { kind: 'p'|'t', id } | null }
export function parsePath(pathname) {
  const seg = String(pathname || "/").split("/").filter(Boolean);
  const module = seg.length ? keyOf(seg[0]) : null;
  let deep = null;
  if (module === "projects" && /^(p|t)$/i.test(seg[1] || "") && /^[0-9a-f-]{36}$/i.test(seg[2] || "")) deep = { kind: seg[1].toLowerCase(), id: seg[2] };
  return { module, sub: module && seg[1] && !deep ? seg[1].replace(/-/g, "_") : null, deep };
}
export const pathFor = (key) => (!key || key === "dashboard" ? "/" : "/" + slugOf(key));
