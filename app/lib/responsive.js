"use client";
import { createContext, useContext, useState, useEffect } from "react";

const ResponsiveContext = createContext({ isMobile: false, isTablet: false, isDesktop: true });

export function ResponsiveProvider({ children }) {
  const [screen, setScreen] = useState({ isMobile: false, isTablet: false, isDesktop: true });

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      setScreen({
        isMobile: w < 769,
        isTablet: w >= 769 && w <= 1024,
        isDesktop: w > 1024,
      });
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return <ResponsiveContext.Provider value={screen}>{children}</ResponsiveContext.Provider>;
}

export function useResponsive() {
  return useContext(ResponsiveContext);
}
