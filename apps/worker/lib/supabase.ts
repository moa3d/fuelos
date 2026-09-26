import { authStorageKey, createSupabaseClient } from "@fuelos/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

let client: SupabaseClient | undefined;

/** The app's single Supabase client (browser only). */
export function supabase(): SupabaseClient {
  client ??= createSupabaseClient({ url: SUPABASE_URL, publishableKey: SUPABASE_PUBLISHABLE_KEY });
  return client;
}

/**
 * Signs the current attendant out of this device, even offline.
 * signOut() returns an error without clearing the session when the network is down, so the stored
 * session is removed by hand in that case — the next attendant must never inherit it.
 */
export async function signOutLocally(): Promise<void> {
  const { error } = await supabase().auth.signOut({ scope: "local" });
  if (error) {
    try {
      localStorage.removeItem(authStorageKey(SUPABASE_URL));
    } catch {
      // storage unavailable — nothing more we can do
    }
  }
}
