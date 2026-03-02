import { supabase } from "./supabase";

// Get current user ID synchronously from session cache
export async function getCurrentUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

// Default org ID - in a multi-org setup this would be dynamic
export const DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001";
