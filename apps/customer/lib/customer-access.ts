// Who's signed in as a customer (RLS: customer_self — a customer only ever sees their own row). Mirrors
// apps/owner-web/lib/office.ts's shape, simplified: there's no "which station" choice here, and browsing the
// price board (C1) needs no session at all (public_station_prices is granted to anon), so "guest" isn't a
// state this returns — a page either checks access (signed-in flows) or doesn't (the guest price board).
import { supabase } from "./supabase";

export type CustomerAccess =
  | { kind: "customer"; userId: string; name: string | null }
  | { kind: "signed-out" }
  | { kind: "error" };

export async function customerAccess(): Promise<CustomerAccess> {
  const { data: { session } } = await supabase().auth.getSession();
  const userId = session?.user.id;
  if (!userId) return { kind: "signed-out" };
  const { data, error } = await supabase().from("customers").select("full_name").eq("id", userId).maybeSingle();
  if (error) return { kind: "error" };
  return { kind: "customer", userId, name: data?.full_name ?? null };
}

/** First sign-in: customer_self RLS lets a signed-in user insert their own row directly, no RPC. */
export async function ensureCustomerRow(userId: string): Promise<void> {
  const { data } = await supabase().from("customers").select("id").eq("id", userId).maybeSingle();
  if (!data) await supabase().from("customers").insert({ id: userId, full_name: null });
}
