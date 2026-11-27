"use client";
// Entry point for the new Projects suite inside Helm: wires auth, the data client,
// the theme mode and the task-completion sea creatures into WorkApp.
import { useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";
import { CelebrationSwim, pickCelebration } from "../Celebration";
import WorkApp from "./WorkApp";

export default function Work({ onClassic, ...rest }) {
  const { user, profile } = useAuth();
  const { mode, tokens } = useTheme();
  const [swim, setSwim] = useState(null);
  const celebrate = useCallback(() => { if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return; setSwim({ k: Date.now(), v: pickCelebration() }); }, []);
  if (!user || !profile) return null;
  return (<>
    <WorkApp db={supabase} user={user} profile={profile} mode={mode === "dark" ? "dark" : "light"} tokens={tokens} onClassic={onClassic} onCelebrate={celebrate} {...rest} />
    {swim && <CelebrationSwim key={swim.k} variant={swim.v} onDone={() => setSwim(null)} />}
  </>);
}
