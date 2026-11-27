// Styles for the new Projects suite. Colours and type come from Helm's theme:
// every colour is a CSS variable on .hw, filled from the theme tokens by
// themeVars() so the accent and light/dark setting in Settings apply here too.
export const BASE_CSS = `
.hw{
  --paper:#f8f9fb;--surface:#ffffff;--sunken:#f0f1f5;--raise:#f8f9fb;--hover:rgba(26,29,39,.05);--press:rgba(26,29,39,.09);
  --ink:#1a1d27;--ink2:#5c6070;--ink3:#8b8f9e;--ink4:#c0c4d0;
  --line:#e4e6ec;--line2:#d4d7e0;
  --accent:#3b82f6;--accent-h:#2563eb;--accent-soft:#dbeafe;--accent-ink:#1d4ed8;--on-accent:#ffffff;
  --coral:#dc2626;--coral-soft:#fee2e2;--amber:#b45309;--amber-soft:#fef3c7;--green:#16a34a;--green-soft:#dcfce7;
  --violet:#9333ea;--violet-soft:#f3e8ff;--blue:#2563eb;--blue-soft:#dbeafe;--pink:#db2777;--pink-soft:#fce7f3;--slate:#5c6070;--slate-soft:#e8eaef;
  --sh1:0 1px 2px rgba(26,29,39,.06);--sh2:0 4px 14px rgba(26,29,39,.08),0 1px 3px rgba(26,29,39,.06);--sh3:0 18px 44px rgba(26,29,39,.18),0 2px 8px rgba(26,29,39,.08);
  --r:8px;--row:36px;
  --sans:'DM Sans',system-ui,-apple-system,sans-serif;--serif:var(--sans);
  font-family:var(--sans);font-size:13.5px;line-height:1.4;color:var(--ink);-webkit-font-smoothing:antialiased;
}
.hw[data-mode=dark]{
  --paper:#08090b;--surface:#0f1117;--sunken:#161922;--raise:#161922;--hover:rgba(230,233,240,.06);--press:rgba(230,233,240,.1);
  --ink:#e6e9f0;--ink2:#8b93a8;--ink3:#5a6380;--ink4:#3a4256;
  --line:#1e2330;--line2:#2f3748;
  --accent:#3b82f6;--accent-h:#60a5fa;--accent-soft:#1d3a6a;--accent-ink:#93c5fd;--on-accent:#ffffff;
  --coral:#ef4444;--coral-soft:#3d1111;--amber:#eab308;--amber-soft:#3d3000;--green:#22c55e;--green-soft:#0d3a20;
  --violet:#a855f7;--violet-soft:#2d1854;--blue:#60a5fa;--blue-soft:#1d3a6a;--pink:#ec4899;--pink-soft:#3b1529;--slate:#8b93a8;--slate-soft:#1c2030;
  --sh1:0 1px 2px rgba(0,0,0,.4);--sh2:0 4px 14px rgba(0,0,0,.45);--sh3:0 18px 44px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04);
}
.hw *,.hw *::before,.hw *::after{box-sizing:border-box}
:where(.hw) button{font:inherit;color:inherit}
:where(.hw) input,:where(.hw) textarea,:where(.hw) select{font:inherit;color:inherit}
.hw ::selection{background:var(--accent-soft)}
/* Helm's global mobile rules size every button and input for touch; this suite sets its own sizes. */
.hw button,.hw input,.hw select,.hw textarea{min-height:0}
@media (max-width:768px){.hw button{font-size:13px !important}.hw .hw-tab,.hw .hw-ni{font-size:14px !important}.hw .hw-seg button,.hw .hw-btn.sm,.hw .hw-fopt{font-size:12.5px !important}.hw .hw-cal-d{font-size:13px !important}.hw table{font-size:13px}.hw th,.hw td{padding:9px 10px !important}}
.hw-scroll{scrollbar-width:thin;scrollbar-color:var(--line2) transparent}
.hw-scroll::-webkit-scrollbar{width:10px;height:10px}
.hw-scroll::-webkit-scrollbar-thumb{background:var(--line2);border-radius:10px;border:3px solid transparent;background-clip:content-box}
.hw-scroll::-webkit-scrollbar-thumb:hover{background:var(--ink4);background-clip:content-box;border:3px solid transparent}
.hw-num{font-variant-numeric:tabular-nums}
.hw-serif{font-weight:700;letter-spacing:-.01em}
.hw-trunc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.hw-eyebrow{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}

/* buttons */
.hw-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border-radius:7px;border:1px solid var(--line2);background:var(--surface);color:var(--ink);font-weight:500;font-size:13px;cursor:pointer;white-space:nowrap;transition:background .12s,border-color .12s,box-shadow .12s,transform .06s;user-select:none}
.hw-btn:hover{background:var(--raise);border-color:var(--ink4)}
.hw-btn:active{transform:translateY(.5px)}
.hw-btn:focus-visible,.hw-icb:focus-visible,.hw-tab:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.hw-btn[disabled]{opacity:.45;cursor:default;pointer-events:none}
.hw-btn.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent);font-weight:600}
.hw-btn.primary:hover{background:var(--accent-h);border-color:var(--accent-h)}
.hw-btn.ghost{border-color:transparent;background:transparent;color:var(--ink2)}
.hw-btn.ghost:hover{background:var(--hover);color:var(--ink)}
.hw-btn.on{background:var(--accent-soft);border-color:transparent;color:var(--accent-ink)}
.hw-btn.danger{color:var(--coral)}
.hw-btn.sm{height:26px;padding:0 8px;font-size:12.5px;border-radius:6px}
.hw-btn .cnt{font-size:11px;font-weight:600;background:var(--accent);color:var(--on-accent);border-radius:9px;padding:0 5px;line-height:16px}
.hw-icb{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:7px;border:none;background:transparent;color:var(--ink3);cursor:pointer;transition:background .12s,color .12s;flex:none}
.hw-icb:hover{background:var(--hover);color:var(--ink)}
.hw-icb.sm{width:24px;height:24px;border-radius:6px}
.hw-icb.on{color:var(--accent-ink);background:var(--accent-soft)}

/* inputs */
.hw-input{height:30px;border-radius:7px;border:1px solid var(--line2);background:var(--surface);padding:0 10px;outline:none;width:100%;transition:border-color .12s,box-shadow .12s}
.hw-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.hw-input::placeholder{color:var(--ink3)}
textarea.hw-input{height:auto;padding:8px 10px;resize:vertical;line-height:1.5}
.hw-bare{border:none;background:transparent;outline:none;padding:0;width:100%;min-width:0}
.hw-bare::placeholder{color:var(--ink3)}

/* popover + menu */
.hw-pop{position:fixed;z-index:1000;background:var(--surface);border:1px solid var(--line);border-radius:11px;box-shadow:var(--sh3);padding:5px;min-width:180px;max-width:min(420px,calc(100vw - 16px));animation:hw-pop .13s cubic-bezier(.2,.8,.2,1);transform-origin:top left}
@keyframes hw-pop{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}
.hw-mi{display:flex;align-items:center;gap:9px;padding:6px 9px;border-radius:7px;cursor:pointer;font-size:13px;color:var(--ink);user-select:none;min-height:30px}
.hw-mi:hover,.hw-mi.hi{background:var(--hover)}
.hw-mi.sel{color:var(--accent-ink);font-weight:500}
.hw-mi.danger{color:var(--coral)}
.hw-mi .k{margin-left:auto;font-size:11px;color:var(--ink3);font-variant-numeric:tabular-nums}
.hw-mi svg{flex:none;color:var(--ink3)}
.hw-mi.sel svg,.hw-mi.danger svg{color:inherit}
.hw-msep{height:1px;background:var(--line);margin:5px 4px}
.hw-mlabel{padding:6px 9px 3px;font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--ink3)}
.hw-msearch{display:flex;align-items:center;gap:7px;padding:5px 8px 7px;border-bottom:1px solid var(--line);margin:0 -5px 5px;padding-left:13px;color:var(--ink3)}

/* chips, dots, avatars */
.hw-chip{display:inline-flex;align-items:center;gap:5px;height:21px;padding:0 8px;border-radius:11px;font-size:11.5px;font-weight:550;white-space:nowrap;background:var(--c-soft,var(--slate-soft));color:var(--c,var(--slate));max-width:100%}
.hw-chip.line{background:transparent;box-shadow:inset 0 0 0 1px var(--line2);color:var(--ink2)}
.hw-chip i{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}
.hw-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--c,var(--ink4))}
.hw-av{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-weight:600;color:#fff;flex:none;object-fit:cover;letter-spacing:.01em;user-select:none}
.hw-av.empty{background:transparent;color:var(--ink4);border:1.5px dashed var(--ink4)}
.hw-avs{display:inline-flex}.hw-avs>*{margin-left:-6px;box-shadow:0 0 0 2px var(--surface)}.hw-avs>*:first-child{margin-left:0}

/* completion check */
.hw-check{width:18px;height:18px;border-radius:50%;border:1.5px solid var(--ink4);background:transparent;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:none;padding:0;color:transparent;transition:border-color .12s,background .15s,color .12s,transform .15s}
.hw-check:hover{border-color:var(--green);color:var(--green);background:var(--green-soft)}
.hw-check.done{background:var(--green);border-color:var(--green);color:#fff;animation:hw-tick .28s cubic-bezier(.3,1.6,.5,1)}
.hw-check.ms{border-radius:3px;transform:rotate(45deg) scale(.86)}
.hw-check.ms svg{transform:rotate(-45deg)}
.hw-check.ap{border-radius:5px}
@keyframes hw-tick{0%{transform:scale(.7)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
.hw-check.ms.done{animation:none}

/* tabs */
.hw-tabs{display:flex;align-items:center;gap:2px;min-width:0}
.hw-tab{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border:none;background:transparent;color:var(--ink3);font-weight:500;font-size:13px;cursor:pointer;border-radius:7px 7px 0 0;position:relative;white-space:nowrap;transition:color .12s}
.hw-tab:hover{color:var(--ink)}
.hw-tab.on{color:var(--ink)}
.hw-tab.on::after{content:'';position:absolute;left:8px;right:8px;bottom:-1px;height:2px;background:var(--accent);border-radius:2px}

/* modal + toast */
.hw-scrim{position:fixed;inset:0;z-index:900;background:rgba(12,19,18,.38);backdrop-filter:blur(2px);display:flex;align-items:flex-start;justify-content:center;padding:8vh 16px 16px;animation:hw-fade .14s}
@keyframes hw-fade{from{opacity:0}to{opacity:1}}
.hw-modal{background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--sh3);width:min(560px,100%);max-height:84vh;display:flex;flex-direction:column;animation:hw-pop .16s cubic-bezier(.2,.8,.2,1)}
.hw-modal-h{padding:18px 20px 0;display:flex;align-items:center;gap:10px}
.hw-modal-h h3{margin:0;font-weight:700;font-size:17px;flex:1}
.hw-modal-b{padding:14px 20px;overflow:auto}
.hw-modal-f{padding:12px 20px 16px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--line)}
.hw-field{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
.hw-field>label{font-size:12px;font-weight:550;color:var(--ink2)}
.hw-toasts{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:1200;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}
.hw-toast{pointer-events:auto;background:var(--ink);color:var(--paper);border-radius:10px;padding:9px 12px 9px 14px;font-size:13px;font-weight:500;box-shadow:var(--sh3);display:flex;align-items:center;gap:12px;animation:hw-rise .2s cubic-bezier(.2,.8,.2,1)}
.hw-toast button{background:transparent;border:none;color:var(--accent-soft);font-weight:600;cursor:pointer;padding:2px 6px;border-radius:5px}
.hw[data-mode=dark] .hw-toast button{color:var(--accent)}
.hw-toast button:hover{background:rgba(255,255,255,.12)}
@keyframes hw-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

/* date picker */
.hw-cal{padding:8px;width:268px}
.hw-cal-h{display:flex;align-items:center;gap:4px;margin-bottom:6px}
.hw-cal-h b{flex:1;font-weight:600;font-size:13px;padding-left:6px}
.hw-cal-g{display:grid;grid-template-columns:repeat(7,1fr);gap:1px}
.hw-cal-g span{font-size:10.5px;color:var(--ink3);text-align:center;padding:4px 0;font-weight:600}
.hw-cal-d{height:32px;border:none;background:transparent;border-radius:7px;cursor:pointer;font-variant-numeric:tabular-nums;font-size:12.5px;color:var(--ink)}
.hw-cal-d:hover{background:var(--hover)}
.hw-cal-d.out{color:var(--ink4)}
.hw-cal-d.today{box-shadow:inset 0 0 0 1px var(--accent);color:var(--accent-ink);font-weight:600}
.hw-cal-d.in{background:var(--accent-soft);border-radius:0}
.hw-cal-d.sel{background:var(--accent);color:var(--on-accent);font-weight:600}
.hw-cal-f{display:flex;gap:6px;flex-wrap:wrap;padding-top:8px;margin-top:6px;border-top:1px solid var(--line)}
.hw-seg{display:inline-flex;background:var(--sunken);border-radius:8px;padding:2px;gap:2px}
.hw-seg button{border:none;background:transparent;height:24px;padding:0 9px;border-radius:6px;font-size:12px;font-weight:500;color:var(--ink2);cursor:pointer}
.hw-seg button.on{background:var(--surface);color:var(--ink);box-shadow:var(--sh1)}
.hw-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:56px 20px;color:var(--ink3);text-align:center}
.hw-empty h4{margin:0;font-weight:650;font-size:16px;color:var(--ink)}
.hw-kbd{font-size:10.5px;font-weight:600;border:1px solid var(--line2);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--ink2);background:var(--raise);font-family:var(--sans)}
.hw-progress{height:5px;border-radius:5px;background:var(--sunken);overflow:hidden}
.hw-progress>i{display:block;height:100%;border-radius:5px;background:var(--c,var(--accent));transition:width .3s}
`;

export const TONES = {
  slate: ["var(--slate)", "var(--slate-soft)"], teal: ["var(--accent-ink)", "var(--accent-soft)"], green: ["var(--green)", "var(--green-soft)"],
  amber: ["var(--amber)", "var(--amber-soft)"], coral: ["var(--coral)", "var(--coral-soft)"], violet: ["var(--violet)", "var(--violet-soft)"],
  blue: ["var(--blue)", "var(--blue-soft)"], pink: ["var(--pink)", "var(--pink-soft)"],
};
export const tone = (name) => { const t = TONES[name] || TONES.slate; return { "--c": t[0], "--c-soft": t[1] }; };
// Project / section / label colours people can pick (Helm's section and avatar palettes).
export const SWATCHES = ["#3b82f6", "#a855f7", "#ec4899", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#84cc16", "#6b7280"];
export const AVATAR_BG = ["#3b82f6", "#a855f7", "#ec4899", "#06b6d4", "#f97316", "#22c55e", "#84cc16", "#ef4444"];

// CSS variables for .hw from Helm's theme tokens (lib/theme). Spread into the root's style.
export function themeVars(t, dark) {
  if (!t || !t.bg) return undefined;
  const mix = (a, pct, b) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
  return {
    "--paper": t.bg, "--surface": t.surface, "--sunken": t.surface2, "--raise": dark ? t.surface2 : t.bg, "--ink": t.text, "--ink2": t.text2, "--ink3": t.text3, "--ink4": dark ? t.border2 : t.border2,
    "--line": mix(t.border, dark ? 80 : 62, t.surface), "--line2": t.border,
    "--accent": t.accent, "--accent-h": dark ? t.accentHover : mix(t.accent, 86, "#000"), "--accent-soft": t.accentDim, "--accent-ink": dark ? t.accentHover : mix(t.accent, 78, "#000"),
    "--coral": t.red, "--coral-soft": t.redDim, "--amber": dark ? t.yellow : mix(t.yellow, 82, "#000"), "--amber-soft": t.yellowDim, "--green": t.green, "--green-soft": t.greenDim,
    "--violet": t.purple, "--violet-soft": t.purpleDim, "--pink": t.pink, "--pink-soft": mix(t.pink, 14, t.surface), "--slate": t.text2, "--slate-soft": t.surface3,
  };
}
