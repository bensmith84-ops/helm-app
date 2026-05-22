"use client";

// Stage 3: monkey-patch fetch to redirect Supabase Functions → helm-api when USE_HELM_API=true
// Force eager Firebase init at app boot. Bare import was being tree-shaken; named import keeps it.
import { firebaseApp } from "./lib/firebase";
if (typeof window !== "undefined") {
  window.__firebaseApp__ = firebaseApp; // diagnostic handle + prevents tree-shake
}
import "./lib/fetchIntercept";
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
