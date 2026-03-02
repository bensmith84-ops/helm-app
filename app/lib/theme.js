"use client";
import { createContext, useContext, useState, useEffect, useCallback } from "react";

const DARK = {
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

const LIGHT = {
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

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState("dark");

  useEffect(() => {
    try { const saved = window.localStorage.getItem("helm-theme"); if (saved === "light" || saved === "dark") setMode(saved); } catch {}
  }, []);

  const toggle = useCallback((m) => {
    setMode(m);
    try { window.localStorage.setItem("helm-theme", m); } catch {}
  }, []);

  const tokens = mode === "light" ? LIGHT : DARK;

  return (
    <ThemeContext.Provider value={{ mode, toggle, tokens }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() { return useContext(ThemeContext); }

// Singleton mutable ref so non-React code (tokens.js) can read current theme
let _current = DARK;
export function _setTokens(t) { _current = t; }
export function getTokens() { return _current; }
