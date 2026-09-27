// The customer app's single Supabase client (browser only). Always persists to localStorage — unlike the
// office app, there is no "remember this device" toggle here: it's a personal phone, not a shared till.
import { createSupabaseClient } from "@fuelos/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

let client: SupabaseClient | undefined;

export function supabase(): SupabaseClient {
  client ??= createSupabaseClient({ url: SUPABASE_URL, publishableKey: SUPABASE_PUBLISHABLE_KEY });
  return client;
}
