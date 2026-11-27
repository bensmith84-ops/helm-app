// Tide tokens as plain hex, shaped like Helm's legacy `T` object, so modules
// written against `T` (PLM today) can take the new look by swapping one import.
// Hex rather than CSS variables because that code builds tints by appending
// alpha digits (T.accent + "20").
import { getTokens } from "../../lib/theme";
import { BASE_CSS } from "./theme";

const LIGHT = {
  bg: "#F5F4EF", surface: "#FFFFFF", surface2: "#FAF9F5", surface3: "#EEECE5", surface4: "#E4E1D8", border: "#E6E3DA", border2: "#D5D1C5",
  text: "#16211F", text2: "#4D5957", text3: "#87918F", accent: "#0C7C74", accentHover: "#0A6962", accentDim: "#DDEFEC",
  green: "#2A8755", greenDim: "#DDF1E5", yellow: "#B27405", yellowDim: "#FAEFD4", red: "#D2472B", redDim: "#FBE7E1",
  orange: "#C8621F", purple: "#6452C7", purpleDim: "#EAE6FA", cyan: "#0E8FB0", pink: "#C43F87", lime: "#6E9A1F",
};
const DARK = {
  bg: "#0C1312", surface: "#131C1A", surface2: "#18221F", surface3: "#1E2A27", surface4: "#26332F", border: "#212D2A", border2: "#2D3B37",
  text: "#E7EDEB", text2: "#A5B1AD", text3: "#6F7C78", accent: "#1FA79C", accentHover: "#3FC4B9", accentDim: "#12322F",
  green: "#57C08A", greenDim: "#11301F", yellow: "#E2AA3C", yellowDim: "#35270B", red: "#F0785F", redDim: "#3A1A13",
  orange: "#F2925A", purple: "#9C8DF0", purpleDim: "#231D45", cyan: "#5CC4DC", pink: "#EE7DB5", lime: "#A6CF58",
};
export const isDarkNow = () => { try { return String(getTokens()?.bg || "").toLowerCase() === "#08090b"; } catch { return false; } };
export const T = new Proxy({}, { get(_, key) { return (isDarkNow() ? DARK : LIGHT)[key]; } });

// Styles for legacy inline-styled modules wrapped in <div className="hw plm">.
export const PLM_CSS = BASE_CSS + `
.plm{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--paper)}
.plm input:not([type=checkbox]):not([type=radio]):not([type=range]),.plm select,.plm textarea{transition:border-color .12s,box-shadow .12s}
.plm input:not([type=checkbox]):not([type=radio]):not([type=range]):focus,.plm select:focus,.plm textarea:focus{border-color:var(--accent) !important;box-shadow:0 0 0 3px var(--accent-soft)}
.plm button{transition:background .12s,border-color .12s,color .12s,opacity .12s}
.plm table{font-variant-numeric:tabular-nums}
.plm-top{background:var(--surface);border-bottom:1px solid var(--line);padding:14px 24px 0;flex:none}
.plm-top h1{margin:0;font-family:var(--serif);font-weight:400;font-size:27px;letter-spacing:-.012em;line-height:1.15}
.plm-stat{display:flex;align-items:baseline;gap:6px;font-size:12.5px;color:var(--ink3);white-space:nowrap}
.plm-stat b{font-family:var(--serif);font-weight:400;font-size:22px;color:var(--ink);font-variant-numeric:tabular-nums}
.plm-body{flex:1;min-height:0;overflow:auto;padding:18px 24px 28px}
.plm-pipe{display:flex;gap:10px;align-items:stretch;min-height:100%}
.plm-col{width:244px;flex:none;border-radius:12px;background:var(--sunken);padding:10px 8px 8px;display:flex;flex-direction:column;gap:8px}
.plm-col.slim{width:44px;align-items:center;padding:10px 0;cursor:default}
.plm-col.slim .vt{writing-mode:vertical-rl;font-size:11.5px;font-weight:600;color:var(--ink3);letter-spacing:.02em;margin-top:4px}
.plm-col-h{display:flex;align-items:center;gap:7px;padding:0 4px 2px}
.plm-col-h b{font-weight:650;font-size:13px}
.plm-col-h span{font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums}
.plm-card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:11px 12px;cursor:pointer;box-shadow:var(--sh1);transition:box-shadow .12s,border-color .12s,transform .12s;border-left:3px solid var(--c,var(--accent))}
.plm-card:hover{box-shadow:var(--sh2);border-color:var(--line2);border-left-color:var(--c,var(--accent));transform:translateY(-1px)}
.plm-card .nm{font-weight:600;font-size:13.5px;line-height:1.3;margin:2px 0 8px}
.plm-card .ft{display:flex;align-items:center;gap:10px;margin-top:9px;font-size:11.5px;color:var(--ink3)}
.plm-card .ft span{display:inline-flex;align-items:center;gap:4px}
.plm-gate{display:flex;gap:3px}
.plm-gate button{flex:1;min-width:0;border:none;background:transparent;padding:0;cursor:pointer;text-align:left}
.plm-gate .bar{display:block;height:6px;border-radius:3px;background:var(--sunken);transition:background .15s}
.plm-gate .lb{display:block;font-size:10.5px;font-weight:600;color:var(--ink3);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.plm-gate button:hover .bar{background:var(--line2)}
.plm-gate button.done .bar{background:color-mix(in srgb,var(--c) 45%,var(--surface))}
.plm-gate button.on .bar{background:var(--c)}
.plm-gate button.on .lb{color:var(--ink)}
.plm-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.plm-kpis>div{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.plm-kpis b{display:block;font-family:var(--serif);font-weight:400;font-size:30px;line-height:1;font-variant-numeric:tabular-nums}
.plm-kpis span{font-size:12px;color:var(--ink3)}
.plm-panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.plm-table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.plm-table th{text-align:left;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink3);padding:10px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
.plm-table td{padding:11px 14px;border-bottom:1px solid var(--line);font-size:13px}
.plm-table tbody tr{cursor:pointer}
.plm-table tbody tr:hover{background:var(--raise)}
.plm-table tbody tr:last-child td{border-bottom:none}
@media (max-width:768px){.plm-top{padding:10px 12px 0}.plm-body{padding:12px}.plm-top h1{font-size:22px}}
`;
