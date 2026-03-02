"use client";
import { AuthProvider } from "./lib/auth";
import { ModalProvider } from "./lib/modal";

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <ModalProvider>
        {children}
      </ModalProvider>
    </AuthProvider>
  );
}
