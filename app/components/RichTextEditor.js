"use client";

import { useRef, useState, useEffect } from "react";

const ALLOWED = new Set(["B","STRONG","I","EM","U","S","STRIKE","H1","H2","H3","UL","OL","LI","A","BR","P","DIV","SPAN","BLOCKQUOTE","CODE"]);

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Strip anything outside a safe subset (defends against pasted/injected markup).
function sanitize(html) {
  if (typeof document === "undefined") return html;
  const root = document.createElement("div");
  root.innerHTML = html;
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 1) {
        if (!ALLOWED.has(child.tagName)) { child.replaceWith(...child.childNodes); return; }
        [...child.attributes].forEach((attr) => {
          const keep = child.tagName === "A" && attr.name === "href" && !/^\s*javascript:/i.test(attr.value);
          if (!keep) child.removeAttribute(attr.name);
        });
        if (child.tagName === "A") { child.setAttribute("target", "_blank"); child.setAttribute("rel", "noreferrer noopener"); }
        walk(child);
      } else if (child.nodeType !== 3) {
        child.remove();
      }
    });
  };
  walk(root);
  return root.innerHTML;
}

// Old descriptions are plain text (possibly with markdown); render them faithfully.
function toHtml(content) {
  if (!content) return "";
  if (/<(b|strong|i|em|u|s|h1|h2|h3|ul|ol|li|a|p|div|br|blockquote|code)\b/i.test(content)) return sanitize(content);
  return escapeHtml(content).split("\n").map((l) => l ? l : "<br>").join("<br>");
}

export default function RichTextEditor({ value, onChange, placeholder = "Add a description…", T }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const [empty, setEmpty] = useState(true);

  // Initialize once on mount (component is keyed per-task by the parent, so it
  // re-mounts on task switch and stays uncontrolled while editing — no cursor bounce).
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = toHtml(value);
      setEmpty(!ref.current.textContent.trim());
    }
    // eslint-disable-next-line
  }, []);

  const refresh = () => setEmpty(!ref.current || !ref.current.textContent.trim());
  const exec = (cmd, arg) => { document.execCommand(cmd, false, arg); ref.current?.focus(); refresh(); };
  const link = () => { const url = window.prompt("Link URL:"); if (url) exec("createLink", /^https?:\/\//i.test(url) ? url : "https://" + url); };
  const save = () => { setFocused(false); if (ref.current) onChange(sanitize(ref.current.innerHTML)); };

  // Markdown-style input rules at the start of a line.
  const onKeyDown = (e) => {
    if (e.key === " ") {
      const sel = window.getSelection();
      const n = sel && sel.anchorNode;
      if (n && n.nodeType === 3) {
        const before = n.textContent.slice(0, sel.anchorOffset);
        const rule = (clear, cmd, arg) => { e.preventDefault(); n.textContent = n.textContent.slice(sel.anchorOffset); const r = document.createRange(); r.setStart(n, 0); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); document.execCommand(cmd, false, arg); refresh(); };
        if (before === "*" || before === "-") return rule(true, "insertUnorderedList");
        if (/^\d+\.$/.test(before)) return rule(true, "insertOrderedList");
        if (before === "#") return rule(true, "formatBlock", "<h1>");
        if (before === "##") return rule(true, "formatBlock", "<h2>");
        if (before === "###") return rule(true, "formatBlock", "<h3>");
      }
    }
  };

  const tb = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 5, border: "none", background: "none", color: T.text2, cursor: "pointer", fontSize: 13, fontWeight: 700 };
  const Btn = ({ cmd, arg, label, title, style }) => (
    <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); cmd === "__link" ? link() : exec(cmd, arg); }}
      style={{ ...tb, ...style }}
      onMouseEnter={(e) => e.currentTarget.style.background = T.surface3}
      onMouseLeave={(e) => e.currentTarget.style.background = "none"}>{label}</button>
  );
  const sep = <div style={{ width: 1, height: 16, background: T.border, margin: "0 3px" }} />;

  return (
    <div style={{ border: `1px solid ${focused ? T.accent : T.border}`, borderRadius: 8, background: T.surface2, transition: "border-color 0.15s" }}>
      <style>{`.rte-body h1{font-size:18px;font-weight:700;margin:8px 0 4px;color:${T.text}}.rte-body h2{font-size:15px;font-weight:700;margin:7px 0 3px;color:${T.text}}.rte-body h3{font-size:13px;font-weight:700;margin:6px 0 2px;color:${T.text2}}.rte-body ul,.rte-body ol{margin:4px 0;padding-left:22px}.rte-body li{margin:1px 0}.rte-body a{color:${T.accent};text-decoration:underline}.rte-body p{margin:3px 0}.rte-body:focus{outline:none}`}</style>
      {focused && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, padding: "5px 8px", borderBottom: `1px solid ${T.border}` }} onMouseDown={(e) => e.preventDefault()}>
          <Btn cmd="bold" label="B" title="Bold (Ctrl/⌘+B)" />
          <Btn cmd="italic" label={<span style={{ fontStyle: "italic" }}>I</span>} title="Italic (Ctrl/⌘+I)" />
          <Btn cmd="strikeThrough" label={<span style={{ textDecoration: "line-through" }}>S</span>} title="Strikethrough" />
          {sep}
          <Btn cmd="formatBlock" arg="<h1>" label="H1" title="Heading 1" style={{ fontSize: 12 }} />
          <Btn cmd="formatBlock" arg="<h2>" label="H2" title="Heading 2" style={{ fontSize: 12 }} />
          <Btn cmd="formatBlock" arg="<p>" label="¶" title="Normal text" style={{ fontSize: 13 }} />
          {sep}
          <Btn cmd="insertUnorderedList" label="•" title="Bulleted list" style={{ fontSize: 18 }} />
          <Btn cmd="insertOrderedList" label={<span style={{ fontSize: 11 }}>1.</span>} title="Numbered list" />
          {sep}
          <Btn cmd="__link" label="🔗" title="Insert link" style={{ fontSize: 12 }} />
        </div>
      )}
      <div style={{ position: "relative" }}>
        <div ref={ref} className="rte-body" contentEditable suppressContentEditableWarning
          onFocus={() => setFocused(true)} onBlur={save} onInput={refresh} onKeyDown={onKeyDown}
          style={{ minHeight: 84, padding: "10px 12px", fontSize: 13, lineHeight: 1.55, color: T.text, outline: "none", wordBreak: "break-word", cursor: "text" }} />
        {empty && !focused && (
          <div onClick={() => ref.current?.focus()} style={{ position: "absolute", top: 10, left: 12, fontSize: 13, color: T.text3, pointerEvents: "none" }}>{placeholder}</div>
        )}
      </div>
    </div>
  );
}
