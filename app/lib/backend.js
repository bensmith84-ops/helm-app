// Which backend the app talks to. "supabase" (default) is today's setup;
// "gcp" points the same supabase-js client at helm-api (Cloud Run + Cloud SQL
// + Cloud Storage) and signs in with Firebase. Flip with NEXT_PUBLIC_HELM_BACKEND
// at build time; set it back to roll back.
export const HELM_BACKEND = process.env.NEXT_PUBLIC_HELM_BACKEND === "gcp" ? "gcp" : "supabase";
export const IS_GCP = HELM_BACKEND === "gcp";
export const HELM_API_BASE = process.env.NEXT_PUBLIC_HELM_API_URL || "https://helm-api-qp7o2dcl5a-uc.a.run.app";
export const SUPABASE_URL = "https://upbjdmnykheubxkuknuj.supabase.co";
// Base for Supabase-style file URLs ("<base>/storage/v1/object/public/<bucket>/<path>").
export const STORAGE_BASE = IS_GCP ? HELM_API_BASE : SUPABASE_URL;
