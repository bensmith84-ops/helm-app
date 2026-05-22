"use client";

// Stage 3: monkey-patch fetch to redirect Supabase Functions → helm-api when USE_HELM_API=true
// Force eager Firebase init at app boot. firebase.js exports lazy helpers,
// so we have to actually CALL one to trigger initializeApp().
import { getFirebaseAuth } from "./lib/firebase";
if (typeof window !== "undefined") {
  const auth = getFirebaseAuth();
  window.__firebaseAuth__ = auth; // diagnostic handle + prevents tree-shake
  console.log("[helm-app] Firebase init:", auth ? "ok" : "FAILED — check NEXT_PUBLIC_FIREBASE_API_KEY");
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
