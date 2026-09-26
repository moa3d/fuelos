"use client";
import { useEffect } from "react";
import { syncNow } from "@/lib/outbox";
import { supabase } from "@/lib/supabase";

const EVERY_MS = 30_000;

/**
 * Sends the outbox while the app is open: on start, when the connection returns, when the window
 * gets focus, after sign-in, and every 30 s. iOS has no Background Sync, so nothing runs when closed.
 */
export function SyncRunner() {
  useEffect(() => {
    const kick = () => void syncNow().catch(() => undefined);
    const onVisible = () => { if (document.visibilityState === "visible") kick(); };
    kick();
    window.addEventListener("online", kick);
    window.addEventListener("focus", kick);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(kick, EVERY_MS);
    const { data } = supabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") kick();
    });
    return () => {
      window.removeEventListener("online", kick);
      window.removeEventListener("focus", kick);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
      data.subscription.unsubscribe();
    };
  }, []);
  return null;
}
