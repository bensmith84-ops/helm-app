// Styles for PLM. PLM is still mostly inline-styled against the Helm tokens; these classes cover the
// redesigned shell (header, tabs, pipeline, program overview) and share the new Projects primitives.
import { BASE_CSS } from "./theme";

// Styles for legacy inline-styled modules wrapped in <div className="hw plm">.
export const PLM_CSS = BASE_CSS + `
.plm{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--paper)}
.plm input:not([type=checkbox]):not([type=radio]):not([type=range]),.plm select,.plm textarea{transition:border-color .12s,box-shadow .12s}
.plm input:not([type=checkbox]):not([type=radio]):not([type=range]):focus,.plm select:focus,.plm textarea:focus{border-color:var(--accent) !important;box-shadow:0 0 0 3px var(--accent-soft)}
.plm button{transition:background .12s,border-color .12s,color .12s,opacity .12s}
.plm table{font-variant-numeric:tabular-nums}
.plm-top{background:var(--surface);border-bottom:1px solid var(--line);padding:14px 24px 0;flex:none}
.plm-top h1{margin:0;font-weight:700;font-size:19px;line-height:1.2}
.plm-stat{display:flex;align-items:baseline;gap:6px;font-size:12.5px;color:var(--ink3);white-space:nowrap}
.plm-stat b{font-weight:700;font-size:17px;color:var(--ink);font-variant-numeric:tabular-nums}
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
.plm-kpis b{display:block;font-weight:700;font-size:24px;line-height:1.1;font-variant-numeric:tabular-nums}
.plm-kpis span{font-size:12px;color:var(--ink3)}
.plm-panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.plm-table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.plm-table th{text-align:left;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink3);padding:10px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
.plm-table td{padding:11px 14px;border-bottom:1px solid var(--line);font-size:13px}
.plm-table tbody tr{cursor:pointer}
.plm-table tbody tr:hover{background:var(--raise)}
.plm-table tbody tr:last-child td{border-bottom:none}
@media (max-width:768px){.plm-top{padding:10px 12px 0}.plm-body{padding:12px}.plm-top h1{font-size:17px}}
`;

// Home views (programs list, runway, dashboard) and the program overview rail.
export const PLM_HOME_CSS = `
.plm-bar{display:flex;align-items:center;gap:8px;padding:8px 24px;border-bottom:1px solid var(--line);background:var(--surface);flex:none;flex-wrap:wrap;min-height:47px}
.plm-list{flex:1;min-height:0;overflow:auto;background:var(--surface)}
.plm-lhead{display:grid;height:34px;align-items:center;border-bottom:1px solid var(--line);font-size:11.5px;font-weight:600;color:var(--ink3);position:sticky;top:0;background:var(--surface);z-index:2}
.plm-lhead span{padding:0 10px}
.plm-lhead span:first-child{padding-left:54px}
.plm-lgroup{display:flex;align-items:flex-end;gap:8px;height:44px;padding:0 24px 7px 20px;border-bottom:1px solid var(--line);cursor:pointer;user-select:none}
.plm-lgroup b{font-weight:650;font-size:14px}
.plm-lgroup .ct{font-size:12px;color:var(--ink3);padding-bottom:1px;font-variant-numeric:tabular-nums}
.plm-lrow{display:grid;min-height:40px;align-items:center;border-bottom:1px solid var(--line);cursor:pointer}
.plm-lrow:hover{background:var(--raise)}
.plm-lrow>span{padding:0 10px;min-width:0}
.plm-lrow .nm{display:flex;align-items:center;gap:10px;padding-left:54px;font-weight:550}
.plm-lrow .nm i{width:4px;height:20px;border-radius:2px;flex:none}
.plm-lrow .del{opacity:0}
.plm-lrow:hover .del{opacity:1}
.plm-steps{display:flex;gap:3px}
.plm-steps i{flex:1;height:6px;border-radius:3px;display:block}
.plm-late{color:var(--coral);font-weight:600}
.plm-run{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow-x:auto}
.plm-run-h{display:flex;border-bottom:1px solid var(--line)}
.plm-run-name{width:320px;flex:none;border-right:1px solid var(--line);box-sizing:border-box}
.plm-run-m{flex:1;font-size:11.5px;color:var(--ink3);padding:9px 0 8px 6px;border-left:1px solid var(--line);white-space:nowrap;overflow:hidden}
.plm-run-m.now{color:var(--accent-ink);font-weight:700}
.plm-run-m.yr{font-weight:650;color:var(--ink2)}
.plm-run-row{display:flex;min-height:46px;border-bottom:1px solid var(--line);cursor:pointer}
.plm-run-row:hover{background:var(--raise)}
.plm-run-row .plm-run-name{display:flex;align-items:center;gap:10px;padding:0 12px 0 16px}
.plm-run-track{flex:1;position:relative}
.plm-run-bar{position:absolute;top:15px;height:16px;border-radius:8px}
.plm-run-mark{position:absolute;top:15px;margin-left:-8px;width:14px;height:14px;transform:rotate(45deg);border-radius:3px;border:2px solid var(--surface)}
.plm-run-lbl{position:absolute;top:13px;font-size:12.5px;font-weight:600;white-space:nowrap;padding-left:12px}
.plm-legend{display:flex;gap:18px;flex-wrap:wrap;align-items:center;font-size:12.5px;color:var(--ink2);margin-bottom:12px}
.plm-legend span{display:inline-flex;align-items:center;gap:7px}
.plm-tile{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 18px 16px}
.plm-tile .l{font-size:12.5px;font-weight:550;color:var(--ink3)}
.plm-tile .v{font-weight:700;font-size:34px;line-height:1.1;margin-top:4px;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.plm-tile .s{font-size:12.5px;color:var(--ink3);margin-top:2px}
.plm-panel>h4,.plm-h4{margin:0 0 8px;font-size:13.5px;font-weight:650;display:flex;align-items:baseline;gap:10px}
.plm-li{display:flex;align-items:center;gap:10px;min-height:42px;border-top:1px solid var(--line);cursor:pointer}
.plm-li:hover{background:var(--raise)}
.plm-li .t{flex:1;min-width:0}
.plm-li .t b{display:block;font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.plm-li .t small{display:block;font-size:12px;color:var(--ink3)}
.plm-stg{display:grid;grid-template-columns:116px minmax(0,1fr) 28px;align-items:center;gap:12px;height:30px;font-size:13px}
.plm-stg .tr{height:14px;border-radius:4px;background:var(--sunken)}
.plm-stg .tr i{display:block;height:100%;border-radius:4px}
.plm-big{font-weight:700;font-size:28px;line-height:1.15;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.plm-drow{display:grid;grid-template-columns:96px 1fr;gap:8px;min-height:32px;align-items:center;font-size:13px}
.plm-drow>span:first-child{color:var(--ink3)}
.plm-cnt{border:none;background:transparent;text-align:left;padding:4px 6px;margin:-4px -6px;border-radius:8px;cursor:pointer}
.plm-cnt:hover{background:var(--hover)}
.plm-cnt b{display:block;font-weight:700;font-size:22px;line-height:1.15;font-variant-numeric:tabular-nums}
.plm-cnt span{font-size:12px;color:var(--ink3)}
`;
