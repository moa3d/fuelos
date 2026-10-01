// «ربط زبون (اختياري)» on S2 (docs/briefs/06d, delivered in 06e): lookup_customer_for_sale() needs the
// network — never block a cash sale on it (fuelos-offline-sync). Matches a scanned/typed card code or a phone
// number's last 9 digits; the attendant still confirms the name before linking.
import { errorMessage } from "@fuelos/core";
import { supabase } from "./supabase.ts";

export type CustomerMatch = { customerId: string; displayName: string; matchedBy: "card" | "phone"; points: number };
export type LookupResult = { ok: true; match: CustomerMatch | null } | { ok: false; message: string };

export async function lookupCustomerForSale(stationId: string, query: string): Promise<LookupResult> {
  const { data, error } = await supabase()
    .rpc("lookup_customer_for_sale", { p_station: stationId, p_query: query.trim() })
    .abortSignal(AbortSignal.timeout(15_000));
  if (error) {
    const code = error.message?.startsWith("FUELOS_") ? error.message.trim() : error.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
    return { ok: false, message: errorMessage(code) };
  }
  const r = data as { customer_id: string; display_name: string; matched_by: "card" | "phone"; points: number } | null;
  return { ok: true, match: r ? { customerId: r.customer_id, displayName: r.display_name, matchedBy: r.matched_by, points: r.points } : null };
}
