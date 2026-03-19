"use client";
import { AuthProvider } from "./lib/auth";
import { ModalProvider } from "./lib/modal";
import { ThemeProvider } from "./lib/theme";
import { ResponsiveProvider } from "./lib/responsive";

export default function Providers({ children }) {
  return (
    <ThemeProvider>
      <ResponsiveProvider>
        <AuthProvider>
          <ModalProvider>
            {children}
          </ModalProvider>
        </AuthProvider>
      </ResponsiveProvider>
    </ThemeProvider>
  );
}
