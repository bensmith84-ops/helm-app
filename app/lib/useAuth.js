
// React hook for Firebase auth state. Components subscribe to user/loading.
// Renders fine SSR (returns { user: null, loading: true } on server).
"use client";

import { useEffect, useState } from "react";
import { getFirebaseAuth, onAuthStateChanged } from "./firebase";
import { helmPost } from "./helmApi";

// Bind the Firebase UID to the Helm profile on first sign-in.
// Stores the bound status in sessionStorage so we don't re-bind on every render.
async function ensureBound(firebaseUser) {
  if (typeof window === "undefined" || !firebaseUser) return;
  const key = `helm:bound:${firebaseUser.uid}`;
  if (sessionStorage.getItem(key) === "1") return;
  try {
    await helmPost("/auth/bind", {});
    sessionStorage.setItem(key, "1");
  } catch (e) {
    // Non-fatal — surface in console but don't block UI. requireAuth will
    // 401 anyway if there's no profile, and the user can retry by refreshing.
    console.warn("[useAuth] /auth/bind failed:", e?.message || e);
  }
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) ensureBound(u);
    });
    return () => unsub();
  }, []);

  return { user, loading };
}
