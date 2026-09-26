import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseConfig = {
  url: string;
  publishableKey: string;
  /** where the session is kept (default: localStorage). The office app switches it for «تذكّر هذا الجهاز». */
  storage?: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
  /** read a session from the URL (password-reset links). Off by default. */
  detectSessionInUrl?: boolean;
};

/** localStorage key where supabase-js keeps the session (its default: sb-<project ref>-auth-token). */
export function authStorageKey(url: string): string {
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

/**
 * Browser client. Uses only the publishable key; RLS protects the data.
 * One instance per app — call this once and share it.
 */
export function createSupabaseClient({ url, publishableKey, storage, detectSessionInUrl = false }: SupabaseConfig): SupabaseClient {
  if (!url || !publishableKey) throw new Error("Supabase URL and publishable key are required");
  return createClient(url, publishableKey, {
    auth: {
      persistSession: true, autoRefreshToken: true, detectSessionInUrl,
      storageKey: authStorageKey(url),
      ...(storage ? { storage } : {}),
    },
  });
}
