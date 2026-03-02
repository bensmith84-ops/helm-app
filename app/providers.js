"use client";
import { AuthProvider } from "./lib/auth";
import { ModalProvider } from "./lib/modal";
import { ThemeProvider } from "./lib/theme";

export default function Providers({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ModalProvider>
          {children}
        </ModalProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
