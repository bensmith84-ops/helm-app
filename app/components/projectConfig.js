/* ═══════════════════════════════════════════════════════
   PROJECT CONFIG - Shared constants
   ═══════════════════════════════════════════════════════ */
export const STATUS = {
  backlog:     { label: "Backlog",     color: "#6b7280", bg: "#1a1d2a" },
  todo:        { label: "To Do",       color: "#8b93a8", bg: "#1c2030" },
  in_progress: { label: "Working",     color: "#3b82f6", bg: "#1d3a6a" },
  in_review:   { label: "In Review",   color: "#a855f7", bg: "#2d1650" },
  done:        { label: "Done",        color: "#22c55e", bg: "#0d3a20" },
  cancelled:   { label: "Cancelled",   color: "#ef4444", bg: "#3d1111" },
};

export const PRIORITY = {
  urgent:   { label: "Urgent",  color: "#fff",    bg: "#ef4444", dot: "#ef4444" },
  high:     { label: "High",    color: "#ef4444", bg: "#3d1111", dot: "#ef4444" },
  medium:   { label: "Medium",  color: "#eab308", bg: "#3d3000", dot: "#eab308" },
  low:      { label: "Low",     color: "#22c55e", bg: "#0d3a20", dot: "#22c55e" },
  none:     { label: "None",    color: "#6b7280", bg: "#1a1d2a", dot: "#6b7280" },
};

export const SECTION_COLORS = ["#3b82f6", "#a855f7", "#22c55e", "#eab308", "#ef4444", "#ec4899", "#f97316", "#06b6d4"];
export const AVATAR_COLORS = ["#3b82f6", "#a855f7", "#ec4899", "#06b6d4", "#f97316", "#22c55e", "#84cc16", "#ef4444"];
