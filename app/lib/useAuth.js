
// React hook for Firebase auth state. Components subscribe to user/loading.
// Renders fine SSR (returns { user: null, loading: true } on server).
"use client";

import { useEffect, useState } from "react";
import { getFirebaseAuth, onAuthStateChanged } from "./firebase";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { user, loading };
}
