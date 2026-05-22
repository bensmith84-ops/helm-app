
// Firebase Web SDK initialization for Helm.
// Reads NEXT_PUBLIC_FIREBASE_* env vars set in Vercel project settings.
// Stage 4d: Firebase Auth project = helm-496923.
"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Singleton init — Next dev HMR re-imports modules; getApps() avoids "already initialized" errors
function getFirebaseApp() {
  if (typeof window === "undefined") return null; // SSR no-op
  if (getApps().length > 0) return getApp();
  if (!firebaseConfig.apiKey) {
    console.warn("[firebase] NEXT_PUBLIC_FIREBASE_API_KEY not set — Firebase auth disabled");
    return null;
  }
  return initializeApp(firebaseConfig);
}

export function getFirebaseAuth() {
  const app = getFirebaseApp();
  if (!app) return null;
  return getAuth(app);
}

export async function signInWithEmail(email, password) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase not configured");
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOut() {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await fbSignOut(auth);
}

export async function getCurrentIdToken(forceRefresh = false) {
  const auth = getFirebaseAuth();
  if (!auth?.currentUser) return null;
  return auth.currentUser.getIdToken(forceRefresh);
}

export { onAuthStateChanged };
