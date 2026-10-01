// C1/«بطاقتي» (docs/briefs/06d, delivered in 06e): every customer already has a qr_token (12 hex characters,
// backfilled for existing rows). The attendant scans or types it from the worker app's «ربط زبون».
import { supabase } from "./supabase.ts";

export type MyCard = { qrToken: string; displayName: string | null };

export async function loadMyCard(customerId: string): Promise<MyCard> {
  const { data, error } = await supabase().from("customers").select("qr_token, full_name").eq("id", customerId)
    .abortSignal(AbortSignal.timeout(20_000)).single();
  if (error) throw new Error(error.message);
  return { qrToken: data.qr_token, displayName: data.full_name };
}

/** «AB12 CD34 EF56» — grouped for reading aloud or typing by hand when there's no scanner. */
export function groupedCode(qrToken: string): string {
  return (qrToken.match(/.{1,4}/g) ?? [qrToken]).join(" ");
}
