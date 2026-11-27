// Helm "Tide" — the design language for the new Projects suite.
// Warm paper, deep-sea ink, one teal accent. Everything is a CSS variable on
// .hw so light/dark is a single attribute and other modules can adopt it later.
export const BASE_CSS = `
.hw{
  --paper:#F5F4EF;--surface:#FFFFFF;--sunken:#EEECE5;--raise:#FAF9F5;--hover:rgba(22,33,31,.045);--press:rgba(22,33,31,.08);
  --ink:#16211F;--ink2:#4D5957;--ink3:#87918F;--ink4:#B6BDBA;
  --line:#E6E3DA;--line2:#D5D1C5;
  --accent:#0C7C74;--accent-h:#0A6962;--accent-soft:#DDEFEC;--accent-ink:#075E58;--on-accent:#FFFFFF;
  --coral:#D2472B;--coral-soft:#FBE7E1;--amber:#B27405;--amber-soft:#FAEFD4;--green:#2A8755;--green-soft:#DDF1E5;
  --violet:#6452C7;--violet-soft:#EAE6FA;--blue:#2C69DB;--blue-soft:#E1EAFC;--pink:#C43F87;--pink-soft:#FAE2EE;--slate:#65717A;--slate-soft:#E9ECEC;
  --sh1:0 1px 2px rgba(22,33,31,.06);--sh2:0 4px 14px rgba(22,33,31,.08),0 1px 3px rgba(22,33,31,.06);--sh3:0 18px 44px rgba(22,33,31,.18),0 2px 8px rgba(22,33,31,.08);
  --r:8px;--row:36px;
  --sans:'Instrument Sans','DM Sans',system-ui,-apple-system,sans-serif;--serif:'Instrument Serif','Iowan Old Style',Georgia,serif;
  font-family:var(--sans);font-size:13.5px;line-height:1.4;color:var(--ink);-webkit-font-smoothing:antialiased;font-feature-settings:'ss01','cv11';
}
.hw[data-mode=dark]{
  --paper:#0C1312;--surface:#131C1A;--sunken:#090F0E;--raise:#18221F;--hover:rgba(232,238,236,.06);--press:rgba(232,238,236,.1);
  --ink:#E7EDEB;--ink2:#A5B1AD;--ink3:#6F7C78;--ink4:#4A5652;
  --line:#212D2A;--line2:#2D3B37;
  --accent:#3FC4B9;--accent-h:#5AD3C9;--accent-soft:#12322F;--accent-ink:#7CE0D7;--on-accent:#062522;
  --coral:#F0785F;--coral-soft:#3A1A13;--amber:#E2AA3C;--amber-soft:#35270B;--green:#57C08A;--green-soft:#11301F;
  --violet:#9C8DF0;--violet-soft:#231D45;--blue:#6C9DF2;--blue-soft:#14233F;--pink:#EE7DB5;--pink-soft:#3B1529;--slate:#93A0A8;--slate-soft:#1D2628;
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
.hw-serif{font-family:var(--serif);font-weight:400;letter-spacing:-.01em}
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
.hw-modal-h h3{margin:0;font-family:var(--serif);font-weight:400;font-size:22px;flex:1;letter-spacing:-.01em}
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
.hw-empty h4{margin:0;font-family:var(--serif);font-weight:400;font-size:24px;color:var(--ink)}
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
// Project / section / label colours people can pick. Tuned to sit on paper and on ink.
export const SWATCHES = ["#0C7C74", "#2C69DB", "#6452C7", "#C43F87", "#D2472B", "#D98A12", "#2A8755", "#65717A", "#0E8FB0", "#8A5A2B"];
export const AVATAR_BG = ["#0C7C74", "#2C69DB", "#6452C7", "#C43F87", "#C2552D", "#A8770B", "#2A8755", "#516074"];
