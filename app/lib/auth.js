"use client";
import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "./supabase";

const AuthContext = createContext(null);
const ORG_ID = "a0000000-0000-0000-0000-000000000001";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session?.user) loadProfile(session.user);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        // Detect invite/recovery flow — user needs to set password
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
          const providers = session.user.app_metadata?.providers || [];
          const hasPassword = providers.includes("email");
          const isGoogleOnly = providers.includes("google") && !hasPassword;
          const isInvited = !!session.user.invited_at;
          const hasConfirmedPassword = session.user.user_metadata?.has_set_password;
          
          // If user was invited and hasn't set a password yet (and isn't using Google)
          if (isInvited && !hasConfirmedPassword && !isGoogleOnly) {
            setNeedsPasswordSetup(true);
          }
        }
        loadProfile(session.user);
      } else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (authUser) => {
    const userId = authUser.id;
    const email = authUser.email;
    const displayName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || email?.split("@")[0] || "User";

    let { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

    if (existingProfile) {
      setProfile(existingProfile);
      setLoading(false);
      return;
    }

    let { data: emailProfile } = await supabase.from("profiles").select("*").eq("email", email).maybeSingle();

    if (emailProfile) {
      const { data: updated } = await supabase.from("profiles").update({ id: userId }).eq("id", emailProfile.id).select().single();
      if (updated) {
        const oldId = emailProfile.id;
        await Promise.all([
          supabase.from("org_memberships").update({ user_id: userId }).eq("user_id", oldId),
          supabase.from("team_members").update({ user_id: userId }).eq("user_id", oldId),
          supabase.from("project_members").update({ user_id: userId }).eq("user_id", oldId),
          supabase.from("user_module_permissions").update({ user_id: userId }).eq("user_id", oldId),
        ]);
        setProfile(updated);
      } else {
        const { data: newProfile } = await supabase.from("profiles").upsert({
          id: userId, display_name: displayName, email, org_id: emailProfile.org_id || ORG_ID,
        }, { onConflict: "id" }).select().single();
        setProfile(newProfile);
      }
      setLoading(false);
      return;
    }

    const { data: newProfile } = await supabase.from("profiles").upsert({
      id: userId, display_name: displayName, email, org_id: ORG_ID,
    }, { onConflict: "id" }).select().single();

    await supabase.from("org_memberships").upsert({
      org_id: ORG_ID, user_id: userId, role: "member", is_active: true,
    }, { onConflict: "org_id,user_id" }).select();

    await supabase.from("user_module_permissions").upsert({
      user_id: userId,
      allowed_modules: ["dashboard", "scoreboard", "okrs", "scorecard", "projects", "plm"],
      is_admin: false,
    }, { onConflict: "user_id" });

    setProfile(newProfile);
    setLoading(false);
  };

  const setPassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ 
      password,
      data: { has_set_password: true }
    });
    if (error) return { error };
    setNeedsPasswordSetup(false);
    return { success: true };
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
    setNeedsPasswordSetup(false);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, needsPasswordSetup, setPassword, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
