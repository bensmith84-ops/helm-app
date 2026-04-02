"use client";
import { createContext, useContext, useState, useEffect, useCallback } from "react";

export const ACCENT_PRESETS = {
  blue:   { accent: "#3b82f6", accentHover: "#60a5fa", accentDimD: "#1d3a6a", accentDimL: "#dbeafe" },
  indigo: { accent: "#6366f1", accentHover: "#818cf8", accentDimD: "#1e1b4b", accentDimL: "#e0e7ff" },
  violet: { accent: "#8b5cf6", accentHover: "#a78bfa", accentDimD: "#2e1065", accentDimL: "#ede9fe" },
  green:  { accent: "#22c55e", accentHover: "#4ade80", accentDimD: "#0d3a20", accentDimL: "#dcfce7" },
  teal:   { accent: "#14b8a6", accentHover: "#2dd4bf", accentDimD: "#0d2c2a", accentDimL: "#ccfbf1" },
  orange: { accent: "#f97316", accentHover: "#fb923c", accentDimD: "#431407", accentDimL: "#ffedd5" },
  rose:   { accent: "#f43f5e", accentHover: "#fb7185", accentDimD: "#4c0519", accentDimL: "#ffe4e6" },
  amber:  { accent: "#f59e0b", accentHover: "#fbbf24", accentDimD: "#3d2000", accentDimL: "#fef3c7" },
};

const DARK_BASE = {
  bg: "#08090b", surface: "#0f1117", surface2: "#161922", surface3: "#1c2030", surface4: "#232838",
  border: "#242a38", border2: "#2f3748",
  text: "#e6e9f0", text2: "#8b93a8", text3: "#5a6380",
  accent: "#3b82f6", accentHover: "#60a5fa", accentDim: "#1d3a6a",
  green: "#22c55e", greenDim: "#0d3a20",
  yellow: "#eab308", yellowDim: "#3d3000",
  red: "#ef4444", redDim: "#3d1111",
  orange: "#f97316", purple: "#a855f7", purpleDim: "#2d1854",
  cyan: "#06b6d4", pink: "#ec4899", lime: "#84cc16",
};

const LIGHT_BASE = {
  bg: "#f8f9fb", surface: "#ffffff", surface2: "#f0f1f5", surface3: "#e8eaef", surface4: "#dfe1e8",
  border: "#d4d7e0", border2: "#c0c4d0",
  text: "#1a1d27", text2: "#5c6070", text3: "#8b8f9e",
  accent: "#2563eb", accentHover: "#1d4ed8", accentDim: "#dbeafe",
  green: "#16a34a", greenDim: "#dcfce7",
  yellow: "#ca8a04", yellowDim: "#fef9c3",
  red: "#dc2626", redDim: "#fee2e2",
  orange: "#ea580c", purple: "#9333ea", purpleDim: "#f3e8ff",
  cyan: "#0891b2", pink: "#db2777", lime: "#65a30d",
};

const buildTokens = (base, isDark, accentKey) => {
  const ap = ACCENT_PRESETS[accentKey] || ACCENT_PRESETS.blue;
  return {
    ...base,
    accent: ap.accent,
    accentHover: ap.accentHover,
    accentDim: isDark ? ap.accentDimD : ap.accentDimL,
  };
};

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState("light");
  const [accentKey, setAccentKey] = useState("blue");

  useEffect(() => {
    try {
      const savedMode = window.localStorage.getItem("helm-theme");
      if (savedMode === "light" || savedMode === "dark") setMode(savedMode);
      const savedAccent = window.localStorage.getItem("helm-accent");
      if (savedAccent && ACCENT_PRESETS[savedAccent]) setAccentKey(savedAccent);
    } catch {}
  }, []);

  const toggle = useCallback((m) => {
    setMode(m);
    try { window.localStorage.setItem("helm-theme", m); } catch {}
  }, []);

  const setAccent = useCallback((key) => {
    if (!ACCENT_PRESETS[key]) return;
    setAccentKey(key);
    try { window.localStorage.setItem("helm-accent", key); } catch {}
  }, []);

  const isDark = mode === "dark";
  const tokens = buildTokens(isDark ? DARK_BASE : LIGHT_BASE, isDark, accentKey);

  return (
    <ThemeContext.Provider value={{ mode, toggle, tokens, accentKey, setAccent, ACCENT_PRESETS }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() { return useContext(ThemeContext); }

// Singleton ref for non-React access (tokens.js proxy)
let _current = DARK_BASE;
export function _setTokens(t) { _current = t; }
export function getTokens() { return _current; }
