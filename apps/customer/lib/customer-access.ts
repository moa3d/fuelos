// Who's signed in as a customer (RLS: customer_self — a customer only ever sees their own row). Mirrors
// apps/owner-web/lib/office.ts's shape, simplified: there's no "which station" choice here, and browsing the
// price board (C1) needs no session at all (public_station_prices is granted to anon), so "guest" isn't a
// state this returns — a page either checks access (signed-in flows) or doesn't (the guest price board).
import { supabase } from "./supabase";

export type CustomerAccess =
  | { kind: "customer"; userId: string; name: string | null }
  | { kind: "signed-out" }
  | { kind: "error" };

// TEMPORARY DEV BYPASS — remove once Supabase has a real SMTP provider configured (docs/briefs/04d) and OTP
// email actually delivers. Auto-signs in as the seeded demo customer so C3–C7 can be browser-tested locally
// without going through the (currently broken) email OTP round-trip. Guarded so it can never run in a
// production build: `next build`/`next start` inline NODE_ENV as "production" and this whole branch is
// dead-code-eliminated, but `next dev` keeps it active. Delete this block and the `.env.local` no longer
// needs any addition — it never touches the login page's own code, which stays correct and unchanged for
// when SMTP is fixed.
const DEV_BYPASS = process.env.NODE_ENV !== "production";
const DEV_EMAIL = "customer@demo.fuelos.app";
const DEV_PASSWORD = "FuelOS-demo-2026";

export async function customerAccess(): Promise<CustomerAccess> {
  let { data: { session } } = await supabase().auth.getSession();
  if (!session && DEV_BYPASS) {
    const signIn = await supabase().auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD });
    if (signIn.error) return { kind: "error" };
    session = signIn.data.session;
  }
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
