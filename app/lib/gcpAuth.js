// Supabase-shaped auth on Firebase, so code written against supabase.auth.*
// keeps working when the app runs on Google Cloud.
//
// A Firebase sign-in becomes a Helm session through helm-api's /auth/bind,
// which links it to the existing Helm profile by verified email. session.user.id
// is the Helm profile id (what every table references), and access_token is the
// Firebase ID token helm-api verifies.
"use client";

import {
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  signOut as fbSignOut, updatePassword, onAuthStateChanged,
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase";

const err = (message, extra = {}) => ({ message, ...extra });
const FB_MESSAGES = {
  "auth/invalid-credential": "Invalid login credentials",
  "auth/wrong-password": "Invalid login credentials",
  "auth/user-not-found": "Invalid login credentials",
  "auth/too-many-requests": "Too many attempts. Try again in a few minutes.",
  "auth/popup-closed-by-user": "Sign-in window was closed",
  "auth/requires-recent-login": "Please sign out and sign in again, then retry.",
};
const fbError = (e) => err(FB_MESSAGES[e?.code] || e?.message || String(e), { code: e?.code });

export function installGcpAuth(client, { apiBase, fetchImpl = (...a) => fetch(...a) }) {
  const listeners = new Set();
  let session = null;
  let profileCache = null; // { uid, profile }
  let ready;
  const readyPromise = new Promise((r) => { ready = r; });

  const emit = (event) => { for (const cb of [...listeners]) { try { cb(event, session); } catch (e) { console.error(e); } } };

  async function bind(fbUser) {
    const token = await fbUser.getIdToken();
    if (profileCache?.uid === fbUser.uid) return { token, profile: profileCache.profile };
    const r = await fetchImpl(`${apiBase}/auth/bind`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.profile) throw Object.assign(new Error(body.error || `Sign-in failed (${r.status})`), { status: r.status, hint: body.hint });
    profileCache = { uid: fbUser.uid, profile: body.profile };
    return { token, profile: body.profile };
  }

  function toSession(fbUser, token, profile) {
    const providers = (fbUser.providerData || []).map((p) => (p.providerId === "google.com" ? "google" : p.providerId === "password" ? "email" : p.providerId));
    return {
      access_token: token,
      token_type: "bearer",
      expires_at: Math.floor(Date.now() / 1000) + 3000,
      user: {
        id: profile.id,
        email: fbUser.email,
        firebase_uid: fbUser.uid,
        app_metadata: { providers, provider: providers[0] || null },
        // Passwords are managed by Firebase; there is no "set your password" step.
        user_metadata: { full_name: fbUser.displayName || profile.display_name || null, name: fbUser.displayName || null, has_set_password: true },
        invited_at: null,
      },
    };
  }

  async function refresh(fbUser, event) {
    if (!fbUser) {
      const had = !!session; session = null; profileCache = null;
      ready(); if (had || event === "SIGNED_OUT") emit("SIGNED_OUT");
      return { session: null };
    }
    try {
      const { token, profile } = await bind(fbUser);
      session = toSession(fbUser, token, profile);
      ready(); emit(event || "SIGNED_IN");
      return { session };
    } catch (e) {
      // Signed in to Google/Firebase but not a Helm user: sign back out.
      session = null; profileCache = null;
      try { await fbSignOut(getFirebaseAuth()); } catch {}
      ready(); emit("SIGNED_OUT");
      return { session: null, error: err(e.message, { status: e.status, hint: e.hint }) };
    }
  }

  const fbAuth = getFirebaseAuth();
  if (fbAuth) {
    let first = true;
    onAuthStateChanged(fbAuth, (u) => { const ev = first ? (u ? "SIGNED_IN" : "INITIAL_SESSION") : (u ? "SIGNED_IN" : "SIGNED_OUT"); first = false; refresh(u, ev); });
  } else { ready(); }

  // Fresh token for each read; Firebase caches and renews it under the hood.
  async function currentSession() {
    await readyPromise;
    const u = getFirebaseAuth()?.currentUser;
    if (!u || !session) return null;
    session = { ...session, access_token: await u.getIdToken() };
    return session;
  }

  const auth = {
    getSession: async () => ({ data: { session: await currentSession() }, error: null }),
    getUser: async () => { const s = await currentSession(); return { data: { user: s?.user || null }, error: s ? null : err("Auth session missing!") }; },
    onAuthStateChange: (cb) => {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    },
    signInWithPassword: async ({ email, password }) => {
      try {
        const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
        const out = await refresh(cred.user, "SIGNED_IN");
        if (out.error) return { data: { session: null, user: null }, error: out.error };
        return { data: { session: out.session, user: out.session.user }, error: null };
      } catch (e) { return { data: { session: null, user: null }, error: fbError(e) }; }
    },
    signInWithOAuth: async ({ provider } = {}) => {
      if (provider !== "google") return { data: {}, error: err(`Sign-in with ${provider} is not available`) };
      try {
        const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
        const cred = await signInWithPopup(getFirebaseAuth(), p);
        const out = await refresh(cred.user, "SIGNED_IN");
        return { data: { provider, url: null }, error: out.error || null };
      } catch (e) { return { data: {}, error: fbError(e) }; }
    },
    signUp: async () => ({ data: { user: null, session: null }, error: err("New Helm accounts are created by invitation. Ask an admin to invite you.") }),
    signOut: async () => { try { await fbSignOut(getFirebaseAuth()); } catch {} await refresh(null, "SIGNED_OUT"); return { error: null }; },
    updateUser: async ({ password } = {}) => {
      const u = getFirebaseAuth()?.currentUser;
      if (!u) return { data: { user: null }, error: err("Auth session missing!") };
      if (password) { try { await updatePassword(u, password); } catch (e) { return { data: { user: null }, error: fbError(e) }; } }
      return { data: { user: session?.user || null }, error: null };
    },
    resetPasswordForEmail: async () => ({ data: null, error: err("Use 'Forgot password' on the sign-in page") }),
  };
  client.auth = Object.assign(client.auth, auth);
  return { getAccessToken: async () => (await currentSession())?.access_token || null };
}
