import { useState, useCallback } from "react";

export function useResizableColumns(initialWidths, storageKey) {
  const [widths, setWidths] = useState(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("rc_" + storageKey);
        if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.length === initialWidths.length) return parsed; }
      } catch {}
    }
    return initialWidths;
  });

  const persist = (w) => { if (storageKey && typeof window !== "undefined") { try { localStorage.setItem("rc_" + storageKey, JSON.stringify(w)); } catch {} } };

  const onResizeStart = useCallback((colIndex, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[colIndex];

    const onMove = (ev) => {
      const diff = ev.clientX - startX;
      const newW = Math.max(50, startW + diff);
      setWidths(prev => prev.map((w, i) => i === colIndex ? newW : w));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setWidths(prev => { persist(prev); return prev; });
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [widths, storageKey]);

  const gridTemplate = widths.map((w, i) => i === 0 ? `minmax(${w}px, 1fr)` : `${w}px`).join(" ");

  return { widths, gridTemplate, onResizeStart };
}
