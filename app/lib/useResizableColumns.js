import { useState, useCallback, useRef } from "react";

export function useResizableColumns(initialWidths) {
  const [widths, setWidths] = useState(initialWidths);
  const dragRef = useRef(null);

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
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [widths]);

  const gridTemplate = widths.map((w, i) => i === 0 ? `minmax(${w}px, 1fr)` : `${w}px`).join(" ");

  return { widths, gridTemplate, onResizeStart };
}
