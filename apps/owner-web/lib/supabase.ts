import { createSupabaseClient } from "@fuelos/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env.ts";

const REMEMBER_KEY = "fuelos-office-remember";

/**
 * «تذكّر هذا الجهاز»: the session is kept in localStorage (survives closing the browser) when remembered,
 * otherwise in sessionStorage (gone when the tab closes). Chosen at sign-in.
 */
const sessionStore = {
  target(): Storage {
    try {
      return localStorage.getItem(REMEMBER_KEY) === "no" ? sessionStorage : localStorage;
    } catch {
      return sessionStorage;
    }
  },
  getItem(key: string) {
    try { return this.target().getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string) {
    try { this.target().setItem(key, value); } catch { /* storage blocked */ }
  },
  removeItem(key: string) {
    try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch { /* storage blocked */ }
  },
};

export function setRememberDevice(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? "yes" : "no");
  } catch {
    // storage blocked: the session lives only in this tab
  }
}

let client: SupabaseClient | undefined;

/** The office app's single Supabase client (browser only). */
export function supabase(): SupabaseClient {
  client ??= createSupabaseClient({
    url: SUPABASE_URL, publishableKey: SUPABASE_PUBLISHABLE_KEY, storage: sessionStore, detectSessionInUrl: true,
  });
  return client;
}
