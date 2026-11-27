"use client";
// Primitives for the Projects suite: icons, popovers, menus, pickers, date picker, modal, toasts.
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { tone, SWATCHES } from "./theme";
import { initials, personName, avatarColor, ymd, parseYmd, today, addDays, monthName, fmtDate } from "./model";

const P = {
  check: "M5 12.5l4.2 4.2L19 7", chevD: "M6 9l6 6 6-6", chevR: "M9 6l6 6-6 6", chevL: "M15 6l-6 6 6 6", plus: "M12 5v14M5 12h14", x: "M6 6l12 12M18 6L6 18",
  flask: "M9 3h6M10 3v6.5L4.6 18.4A1.8 1.8 0 006.2 21h11.6a1.8 1.8 0 001.6-2.6L14 9.5V3M7.5 15h9",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-3.8-3.8", filter: "M4 6h16M7 12h10M10 18h4", sort: "M7 5v14m0 0l-3-3m3 3l3-3M17 19V5m0 0l-3 3m3-3l3 3",
  group: "M4 5h16v5H4zM4 14h16v5H4z", cols: "M4 5h16v14H4zM9.5 5v14M14.5 5v14", cal: "M5 6h14v14H5zM5 10h14M9 3.5v4M15 3.5v4", user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20c1-3.6 4-5 7.5-5s6.5 1.400 7.500 5",
  flag: "M6 21V4m0 1h11l-2.500 4L17 13H6", more: "M6 12h.01M12 12h.01M18 12h.01", link: "M10 14a4 4 0 005.700 0l3-3a4 4 0 10-5.700-5.700l-1 1M14 10a4 4 0 00-5.700 0l-3 3a4 4 0 105.700 5.700l1-1",
  clip: "M20 11.500l-8 8a5 5 0 01-7-7l8.500-8.500a3.500 3.500 0 015 5L10 17.500a2 2 0 01-3-3L14.500 7", msg: "M5 5h14v11H10l-4 4v-4H5z", star: "M12 4l2.400 5 5.600.800-4 3.900 1 5.500-5-2.700-5 2.700 1-5.500-4-3.900 5.600-.800z",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13", copy: "M9 9h10v11H9zM5 15V4h10", arrowR: "M5 12h14m0 0l-5-5m5 5l-5 5", diamond: "M12 3l9 9-9 9-9-9z", stamp: "M9 4h6l-1 7h4v4H6v-4h4zM5 20h14",
  list: "M9 6h11M9 12h11M9 18h11M4.500 6h.01M4.500 12h.01M4.500 18h.01", board: "M4 5h4.500v14H4zM9.750 5h4.500v9h-4.500zM15.500 5H20v11h-4.500z", timeline: "M4 6h9M8 12h11M5 18h7", chart: "M5 20V10M12 20V4M19 20v-7",
  home: "M4 11l8-7 8 7v9h-5v-6H9v6H4z", case: "M4 8h16v11H4zM9 8V5h6v3", users: "M9 11a3.500 3.500 0 100-7 3.500 3.500 0 000 7zM2.500 20c.700-3.300 3.200-5 6.500-5s5.800 1.700 6.500 5M16 4.500a3.500 3.500 0 010 6.500M18.500 15.500c1.700.800 2.700 2.300 3 4.500",
  expand: "M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7", clock: "M12 4a8 8 0 100 16 8 8 0 000-16zM12 8v4.500l3 2", lock: "M6 11h12v9H6zM8.500 11V8a3.500 3.500 0 017 0v3",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01", eye: "M2.500 12s3.500-6.500 9.500-6.500S21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12zM12 9.500a2.500 2.500 0 100 5 2.500 2.500 0 000-5z",
  gear: "M12 9a3 3 0 100 6 3 3 0 000-6zM19 12a7 7 0 00-.100-1.300l2-1.500-2-3.400-2.300 1a7 7 0 00-2.300-1.300L14 3h-4l-.300 2.500a7 7 0 00-2.300 1.300l-2.300-1-2 3.400 2 1.500a7 7 0 000 2.600l-2 1.500 2 3.400 2.300-1a7 7 0 002.300 1.300L10 21h4l.300-2.500a7 7 0 002.300-1.300l2.300 1 2-3.400-2-1.500c.100-.400.100-.900.100-1.300z",
  zap: "M13 3L5 13.500h6L10 21l8-10.500h-6z", repeat: "M5 9V7.500A2.500 2.500 0 017.500 5H18m0 0l-3-3m3 3l-3 3M19 15v1.500a2.500 2.500 0 01-2.500 2.500H6m0 0l3 3m-3-3l3-3", sub: "M6 4v8a3 3 0 003 3h9m0 0l-3.500-3.500M18 15l-3.500 3.500",
  dep: "M5 7h5a3 3 0 013 3v4a3 3 0 003 3h3m0 0l-3-3m3 3l-3 3", alert: "M12 4l9 16H3zM12 10v4M12 17h.01", undo: "M4 9h10a5 5 0 010 10h-3M4 9l4-4M4 9l4 4", tag: "M4 4h7l9 9-7 7-9-9zM8 8h.01",
  folder: "M4 6h6l2 2h8v11H4z", inbox: "M4 13l2.500-8h11l2.500 8v6H4zM4 13h5l1 2h4l1-2h5", sun: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2.500v2M12 19.500v2M2.500 12h2M19.500 12h2M5.300 5.300l1.400 1.400M17.300 17.300l1.400 1.400M5.300 18.700l1.400-1.400M17.300 6.700l1.400-1.400",
  side: "M4 5h16v14H4zM10 5v14", thumb: "M7 11v9H4v-9zM7 11l4-7c1.500 0 2.500 1 2.500 2.500V10H19a1.500 1.500 0 011.500 1.800l-1.300 6.700A2 2 0 0117.200 20H7", note: "M5 4h14v16H5zM8.500 9h7M8.500 13h7M8.500 17h4", info: "M12 4a8 8 0 100 16 8 8 0 000-16zM12 11v5M12 8h.01",
  bolt: "M13 3L5 13.500h6L10 21l8-10.500h-6z", up: "M12 19V5m0 0l-6 6m6-6l6 6", pin: "M12 21s7-6.200 7-11a7 7 0 10-14 0c0 4.800 7 11 7 11zM12 8a2.500 2.500 0 100 5 2.500 2.500 0 000-5z", target: "M12 4a8 8 0 100 16 8 8 0 000-16zM12 8.500a3.500 3.500 0 100 7 3.500 3.500 0 000-7z",
  download: "M12 4v11m0 0l-4-4m4 4l4-4M5 20h14", send: "M4 12l16-8-6 16-3-6.500z", smile: "M12 4a8 8 0 100 16 8 8 0 000-16zM8.500 14c.900 1.300 2.100 2 3.500 2s2.600-.700 3.500-2M9 10h.01M15 10h.01", archive: "M4 5h16v4H4zM6 9v10h12V9M10 13h4",
};
export function Icon({ name, size = 16, sw = 1.75, style, fill }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill || "none"} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true"><path d={P[name] || P.more} /></svg>;
}

// The shell sets this so portalled popovers inherit the theme.
const ModeCtx = createContext({ mode: "light", vars: undefined });
export const ModeProvider = ModeCtx.Provider;
export const useMode = () => useContext(ModeCtx);

function Portal({ children }) {
  const { mode, vars } = useMode();
  return typeof document === "undefined" ? null : createPortal(<div className="hw" data-mode={mode} style={vars}>{children}</div>, document.body);
}

// Popover anchored to an element or a {x,y} point. Closes on outside press / Escape.
export function Popover({ anchor, onClose, children, align = "start", gap = 6, width, className = "", style }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el || !anchor) return;
    const place = () => {
      const a = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0 };
      const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
      let left = align === "end" ? a.right - w : align === "center" ? a.left + a.width / 2 - w / 2 : a.left;
      left = Math.round(Math.max(8, Math.min(left, vw - w - 8)));
      let top = a.bottom + gap; if (top + h > vh - 8) top = a.top - gap - h > 8 ? a.top - gap - h : Math.max(8, vh - h - 8); top = Math.round(top);
      setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
    };
    place(); const ro = new ResizeObserver(place); ro.observe(el); window.addEventListener("resize", place);
    return () => { ro.disconnect(); window.removeEventListener("resize", place); };
  }, [anchor, align, gap]);
  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.("[data-hw-pop]")) onClose?.(); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose?.(); } };
    const t = setTimeout(() => { document.addEventListener("mousedown", down, true); document.addEventListener("keydown", key, true); }, 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", down, true); document.removeEventListener("keydown", key, true); };
  }, [onClose]);
  return <Portal><div ref={ref} data-hw-pop className={"hw-pop hw-scroll " + className} style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width, maxHeight: "min(480px, calc(100vh - 16px))", overflowY: "auto", visibility: pos ? "visible" : "hidden", ...style }} onClick={(e) => e.stopPropagation()}>{children}</div></Portal>;
}
// const pop = usePop(); <button onClick={pop.toggle}/> {pop.open && <Popover anchor={pop.anchor} onClose={pop.close}>…}
export function usePop() {
  const [anchor, setAnchor] = useState(null);
  const close = useCallback(() => setAnchor(null), []);
  const toggle = useCallback((e) => { e?.stopPropagation?.(); const el = e?.currentTarget || e; setAnchor((a) => (a ? null : el)); }, []);
  const at = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setAnchor({ x: e.clientX, y: e.clientY }); }, []);
  return { open: !!anchor, anchor, close, toggle, at, show: setAnchor };
}

export const MenuItem = ({ icon, children, onClick, sel, danger, k, right, title }) => (
  <div className={"hw-mi" + (sel ? " sel" : "") + (danger ? " danger" : "")} title={title} onClick={onClick}>
    {icon !== undefined && (typeof icon === "string" ? <Icon name={icon} size={15} /> : icon)}
    <span className="hw-trunc" style={{ flex: 1 }}>{children}</span>
    {right}{k && <span className="k">{k}</span>}{sel && <Icon name="check" size={15} />}
  </div>
);
export const MenuSep = () => <div className="hw-msep" />;
export const MenuLabel = ({ children }) => <div className="hw-mlabel">{children}</div>;

// Searchable option list with keyboard nav. options: [{ value, label, icon?, dot?, hint? }]
export function OptionList({ options, value, multi, onPick, placeholder = "Search…", searchable, footer, autoFocus = true, emptyText = "Nothing found" }) {
  const [q, setQ] = useState(""); const [hi, setHi] = useState(0);
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return s ? options.filter((o) => String(o.label).toLowerCase().includes(s)) : options; }, [q, options]);
  const showSearch = searchable ?? options.length > 7;
  const isSel = (v) => (multi ? (value || []).includes(v) : value === v);
  const key = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && list[hi]) { e.preventDefault(); onPick(list[hi].value, list[hi]); }
  };
  return (
    <div onKeyDown={key} tabIndex={showSearch ? undefined : 0} ref={(el) => { if (el && !showSearch && autoFocus) el.focus({ preventScroll: true }); }} style={{ outline: "none" }}>
      {showSearch && <div className="hw-msearch"><Icon name="search" size={14} /><input className="hw-bare" autoFocus={autoFocus} placeholder={placeholder} value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} /></div>}
      {list.map((o, i) => (
        <div key={String(o.value)} className={"hw-mi" + (i === hi ? " hi" : "") + (isSel(o.value) ? " sel" : "")} onMouseEnter={() => setHi(i)} onClick={() => onPick(o.value, o)}>
          {o.icon}{o.dot && <span className="hw-dot" style={{ background: o.dot }} />}
          <span className="hw-trunc" style={{ flex: 1 }}>{o.label}</span>
          {o.hint && <span className="k">{o.hint}</span>}{isSel(o.value) && <Icon name="check" size={15} />}
        </div>
      ))}
      {!list.length && <div style={{ padding: "10px 9px", color: "var(--ink3)", fontSize: 12.5 }}>{emptyText}</div>}
      {footer}
    </div>
  );
}

export function Avatar({ person, id, size = 22, title }) {
  const name = personName(person);
  if (!person && !id) return <span className="hw-av empty" style={{ width: size, height: size }} title={title || "Unassigned"}><Icon name="user" size={size * 0.56} /></span>;
  if (person?.avatar_url) return <img className="hw-av" src={person.avatar_url} alt="" title={title || name} style={{ width: size, height: size }} />;
  return <span className="hw-av" title={title || name} style={{ width: size, height: size, fontSize: Math.max(9, size * 0.4), background: avatarColor(person?.id || id) }}>{initials(name)}</span>;
}
export const AvatarStack = ({ people, max = 4, size = 22 }) => (
  <span className="hw-avs">{people.slice(0, max).map((p) => <Avatar key={p.id} person={p} size={size} />)}{people.length > max && <span className="hw-av" style={{ width: size, height: size, fontSize: 9.5, background: "var(--sunken)", color: "var(--ink2)" }}>+{people.length - max}</span>}</span>
);
export const Chip = ({ t = "slate", children, dot, line, style, title, onClick }) => <span className={"hw-chip" + (line ? " line" : "")} title={title} onClick={onClick} style={{ ...tone(t), ...style }}>{dot && <i />}<span className="hw-trunc">{children}</span></span>;

export function Check({ done, kind = "task", onClick, size = 18, title }) {
  return <button className={"hw-check" + (done ? " done" : "") + (kind === "milestone" ? " ms" : kind === "approval" ? " ap" : "")} style={{ width: size, height: size }} title={title || (done ? "Mark incomplete" : "Mark complete")} onClick={(e) => { e.stopPropagation(); onClick?.(e); }}>
    <Icon name={kind === "approval" ? "thumb" : "check"} size={size * 0.62} sw={2.4} />
  </button>;
}

export function PersonPicker({ people, value, onPick, allowNone = true, noneLabel = "Unassigned", multi }) {
  const options = useMemo(() => [...(allowNone ? [{ value: null, label: noneLabel, icon: <Avatar size={20} /> }] : []), ...people.map((p) => ({ value: p.id, label: personName(p), hint: p.is_external ? "Guest" : undefined, icon: <Avatar person={p} size={20} /> }))], [people, allowNone, noneLabel]);
  return <OptionList options={options} value={value} multi={multi} onPick={onPick} placeholder="Search people…" searchable />;
}

// Date picker with optional start date. onChange({ start_date, due_date }).
export function DatePicker({ start, due, onChange, onClose, range = true, extra }) {
  const [field, setField] = useState("due");
  const [cursor, setCursor] = useState(() => { const d = parseYmd(due || start) || new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [showStart, setShowStart] = useState(!!start);
  const t0 = today();
  const cells = useMemo(() => { const first = new Date(cursor); const off = (first.getDay() + 6) % 7; const out = []; for (let i = 0; i < 42; i++) { const d = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - off + i); out.push({ s: ymd(d), out: d.getMonth() !== cursor.getMonth(), n: d.getDate() }); } return out; }, [cursor]);
  const pick = (s) => {
    if (field === "start" && showStart) { const nd = due && due < s ? s : due; onChange({ start_date: s, due_date: nd || s }); setField("due"); }
    else { const ns = start && start > s ? null : start; onChange({ start_date: showStart ? ns : null, due_date: s }); if (!showStart) onClose?.(); }
  };
  const fieldBtn = (k, label, v) => <button className={"hw-btn sm" + (field === k ? " on" : "")} style={{ flex: 1, justifyContent: "flex-start" }} onClick={() => setField(k)}><span style={{ color: "var(--ink3)", fontWeight: 500 }}>{label}</span>{v ? fmtDate(v, { relative: false }) : "—"}</button>;
  return (
    <div className="hw-cal">
      {range && showStart && <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>{fieldBtn("start", "Start", start)}{fieldBtn("due", "Due", due)}</div>}
      <div className="hw-cal-h"><b>{monthName(cursor.getMonth(), true)} {cursor.getFullYear()}</b>
        <button className="hw-icb sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><Icon name="chevL" size={15} /></button>
        <button className="hw-btn ghost sm" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
        <button className="hw-icb sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><Icon name="chevR" size={15} /></button></div>
      <div className="hw-cal-g">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
        {cells.map((c) => <button key={c.s} className={"hw-cal-d" + (c.out ? " out" : "") + (c.s === t0 ? " today" : "") + (start && due && c.s > start && c.s < due ? " in" : "") + (c.s === due || c.s === start ? " sel" : "")} onClick={() => pick(c.s)}>{c.n}</button>)}</div>
      <div className="hw-cal-f">
        <button className="hw-btn ghost sm" onClick={() => pick(t0)}>Today</button>
        <button className="hw-btn ghost sm" onClick={() => pick(addDays(t0, 1))}>Tomorrow</button>
        <button className="hw-btn ghost sm" onClick={() => pick(addDays(t0, 7))}>+1 week</button>
        {range && !showStart && <button className="hw-btn ghost sm" onClick={() => { setShowStart(true); setField("start"); }}><Icon name="plus" size={13} />Start date</button>}
        <button className="hw-btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => { onChange({ start_date: null, due_date: null }); onClose?.(); }}>Clear</button>
      </div>
      {extra}
    </div>
  );
}

export function ColorPicker({ value, onPick }) {
  return <div style={{ display: "flex", gap: 6, padding: 6, flexWrap: "wrap", width: 172 }}>{SWATCHES.map((c) => <button key={c} onClick={() => onPick(c)} style={{ width: 22, height: 22, borderRadius: 7, border: "none", background: c, cursor: "pointer", boxShadow: value === c ? "0 0 0 2px var(--surface), 0 0 0 4px " + c : "none" }} />)}</div>;
}

export function Modal({ title, onClose, children, footer, width }) {
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose?.(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  return <Portal><div className="hw-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
    <div className="hw-modal" style={{ width: width ? `min(${width}px,100%)` : undefined }}>
      <div className="hw-modal-h"><h3>{title}</h3><button className="hw-icb" onClick={onClose}><Icon name="x" /></button></div>
      <div className="hw-modal-b hw-scroll">{children}</div>
      {footer && <div className="hw-modal-f">{footer}</div>}
    </div></div></Portal>;
}
export const Field = ({ label, children }) => <div className="hw-field"><label>{label}</label>{children}</div>;

export function Toasts({ toasts, dismiss }) {
  return <Portal><div className="hw-toasts">{toasts.map((t) => <div key={t.id} className="hw-toast">{t.text}{t.action && <button onClick={() => { t.action.run(); dismiss(t.id); }}>{t.action.label}</button>}</div>)}</div></Portal>;
}
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((p) => p.filter((t) => t.id !== id)), []);
  const toast = useCallback((text, action) => { const id = Math.random().toString(36).slice(2); setToasts((p) => [...p.slice(-2), { id, text, action }]); setTimeout(() => dismiss(id), action ? 7000 : 3200); }, [dismiss]);
  return { toasts, toast, dismiss };
}
export const Progress = ({ value, color }) => <div className="hw-progress" style={color ? { "--c": color } : undefined}><i style={{ width: Math.max(0, Math.min(100, value)) + "%" }} /></div>;
export const Seg = ({ value, options, onChange }) => <div className="hw-seg">{options.map(([v, l]) => <button key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>;
export const Empty = ({ title, children, icon }) => <div className="hw-empty">{icon && <Icon name={icon} size={28} sw={1.4} />}<h4>{title}</h4><div style={{ maxWidth: 360 }}>{children}</div></div>;
