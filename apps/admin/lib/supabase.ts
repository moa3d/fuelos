// The admin app's single Supabase client (browser only). FuelOS staff sign in with email + password (they're
// invited internally, not self-service) — no "remember this device" toggle, just the default persistence.
import { createSupabaseClient } from "@fuelos/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

let client: SupabaseClient | undefined;

export function supabase(): SupabaseClient {
  client ??= createSupabaseClient({ url: SUPABASE_URL, publishableKey: SUPABASE_PUBLISHABLE_KEY });
  return client;
}
