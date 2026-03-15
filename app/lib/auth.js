"use client";
import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "./supabase";

const AuthContext = createContext(null);
const ORG_ID = "a0000000-0000-0000-0000-000000000001";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session?.user) loadProfile(session.user);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) loadProfile(session.user);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (authUser) => {
    const userId = authUser.id;
    const email = authUser.email;
    const displayName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || email?.split("@")[0] || "User";

    // Try to find existing profile by ID first
    let { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

    if (existingProfile) {
      setProfile(existingProfile);
      setLoading(false);
      return;
    }

    // Try to find a pre-created profile by email (admin invited this person)
    let { data: emailProfile } = await supabase.from("profiles").select("*").eq("email", email).maybeSingle();

    if (emailProfile) {
      // Link the auth user ID to the existing profile
      // Update the profile's ID to match the auth user's ID
      const { data: updated } = await supabase.from("profiles").update({ id: userId }).eq("id", emailProfile.id).select().single();
      if (updated) {
        // Also update any FK references from the old ID to the new ID
        const oldId = emailProfile.id;
        await Promise.all([
          supabase.from("org_memberships").update({ user_id: userId }).eq("user_id", oldId),
          supabase.from("team_members").update({ user_id: userId }).eq("user_id", oldId),
          supabase.from("project_members").update({ user_id: userId }).eq("user_id", oldId),
          supabase.from("user_module_permissions").update({ user_id: userId }).eq("user_id", oldId),
        ]);
        setProfile(updated);
      } else {
        // If update fails (ID conflict), create a new profile
        const { data: newProfile } = await supabase.from("profiles").upsert({
          id: userId, display_name: displayName, email, org_id: emailProfile.org_id || ORG_ID,
        }, { onConflict: "id" }).select().single();
        setProfile(newProfile);
      }
      setLoading(false);
      return;
    }

    // No existing profile — create a new one
    const { data: newProfile } = await supabase.from("profiles").upsert({
      id: userId, display_name: displayName, email, org_id: ORG_ID,
    }, { onConflict: "id" }).select().single();

    // Create org membership
    await supabase.from("org_memberships").upsert({
      org_id: ORG_ID, user_id: userId, role: "member", is_active: true,
    }, { onConflict: "org_id,user_id" }).select();

    // Set default module permissions
    await supabase.from("user_module_permissions").upsert({
      user_id: userId,
      allowed_modules: ["dashboard", "scoreboard", "okrs", "scorecard", "projects", "plm"],
      is_admin: false,
    }, { onConflict: "user_id" });

    setProfile(newProfile);
    setLoading(false);
  };

  const signUp = async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error };
    return { data };
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
