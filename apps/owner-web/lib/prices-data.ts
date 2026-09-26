// O9 «أسعار الوقود»: what is published, what the customer sees, the stock behind it and the open shifts a change
// would not reach. Publishing goes through publish_price() (owner only); availability is written to
// product_availability (owner or shift manager, by RLS). The price of a shift is locked when it opens (server rule).
import { errorMessage } from "@fuelos/core";
import { avgCostCents, currentPrices, scheduledPrices, suggestedAvailability } from "./price-rules";
import { supabase } from "./supabase";

type Num = number | string;
export type Availability = "available" | "limited" | "unavailable";

export type ProductRow = {
  id: string; name: string;
  price: Num | null; priceSince: string | null; priceBy: string;
  scheduled: { id: string; price: Num; effectiveAt: string }[];
  availability: Availability | null; availabilitySource: "computed" | "manual" | null; availabilityAt: string | null;
  bookPct: number | null; minPct: number | null; suggestion: Availability | null;
  /** estimated average purchase cost (owner / accountant only) */
  avgCostCents: bigint | null;
  /** what the customer app shows now (public_station_prices) */
  publicPrice: Num | null; publicAvailability: Availability | null; publicUpdatedAt: string | null;
};
export type HistoryRow = { id: string; product: string; price: Num; effectiveAt: string; by: string; inForce: boolean };
export type OpenShift = { id: string; attendant: string; pumps: number[]; openedAt: string };

export type PricesData = {
  products: ProductRow[];
  history: HistoryRow[];
  openShifts: OpenShift[];
  priceReports: { count: number; latest: string | null };
  stationStatus: string;
  publicVisible: boolean;
  fetchedAt: string;
};

const signal = () => AbortSignal.timeout(20_000);

export async function loadPrices(stationId: string, canSeeCost: boolean): Promise<PricesData> {
  const sb = supabase();
  const [products, prices, avail, tanks, levels, members, shifts, reports, publicView, station, deliveries] = await Promise.all([
    sb.from("products").select("id, name").eq("station_id", stationId).eq("is_active", true).order("name").abortSignal(signal()),
    sb.from("prices").select("id, product_id, price, effective_at, published_by").eq("station_id", stationId)
      .order("effective_at", { ascending: false }).limit(200).abortSignal(signal()),
    sb.from("product_availability").select("product_id, status, source, updated_at").eq("station_id", stationId).abortSignal(signal()),
    sb.from("tanks").select("id, product_id, capacity_l, min_level_pct").eq("station_id", stationId).eq("is_active", true).abortSignal(signal()),
    sb.from("tank_book_levels").select("tank_id, book_l").eq("station_id", stationId).abortSignal(signal()),
    sb.from("station_members").select("user_id, display_name").eq("station_id", stationId).abortSignal(signal()),
    sb.from("shifts").select("id, attendant_id, opened_at, shift_legs(ended_at, pumps(number))")
      .eq("station_id", stationId).in("status", ["open", "reopened"]).abortSignal(signal()),
    sb.from("complaints").select("subject, created_at", { count: "exact" }).eq("station_id", stationId).eq("kind", "price_report")
      .neq("status", "resolved").order("created_at", { ascending: false }).limit(1).abortSignal(signal()),
    sb.from("public_station_prices").select("product_id, price, availability, availability_updated_at, price_updated_at").eq("station_id", stationId).abortSignal(signal()),
    sb.from("stations").select("status").eq("id", stationId).abortSignal(signal()).maybeSingle(),
    canSeeCost
      ? sb.from("fuel_deliveries").select("tank_id, liters, unit_cost, extra_costs").eq("station_id", stationId).not("unit_cost", "is", null).limit(1000).abortSignal(signal())
      : Promise.resolve({ data: [] as { tank_id: string; liters: Num; unit_cost: Num | null; extra_costs: Num | null }[], error: null }),
  ]);
  const failed = [products, prices, avail, tanks, levels, members, shifts, reports, publicView, station, deliveries].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const now = Date.now();
  const nameOf = new Map((members.data ?? []).map((m) => [m.user_id as string, m.display_name as string]));
  const priceRows = (prices.data ?? []) as { id: string; product_id: string; price: Num; effective_at: string; published_by: string | null }[];
  const inForce = currentPrices(priceRows, now);
  const scheduled = scheduledPrices(priceRows, now);
  const availOf = new Map((avail.data ?? []).map((a) => [a.product_id as string, a]));
  const bookOf = new Map((levels.data ?? []).map((l) => [l.tank_id as string, Number(l.book_l)]));
  const publicOf = new Map((publicView.data ?? []).map((p) => [p.product_id as string, p]));
  const costRows = (deliveries.data ?? []) as { tank_id: string; liters: Num; unit_cost: Num | null; extra_costs: Num | null }[];

  const rows: ProductRow[] = (products.data ?? []).map((p) => {
    const pt = (tanks.data ?? []).filter((t) => t.product_id === p.id);
    const capacity = pt.reduce((s, t) => s + Number(t.capacity_l), 0);
    const book = pt.reduce((s, t) => s + (bookOf.get(t.id) ?? 0), 0);
    const bookPct = capacity > 0 ? Math.round((book / capacity) * 100) : null;
    const minPct = pt.length > 0 ? Math.max(...pt.map((t) => Number(t.min_level_pct))) : null;
    const cur = inForce.get(p.id);
    const a = availOf.get(p.id);
    const pub = publicOf.get(p.id);
    const tankIds = new Set(pt.map((t) => t.id));
    return {
      id: p.id, name: p.name,
      price: cur?.price ?? null, priceSince: cur?.effective_at ?? null, priceBy: cur?.published_by ? nameOf.get(cur.published_by) ?? "" : "",
      scheduled: scheduled.filter((s) => s.product_id === p.id).map((s) => ({ id: (s as { id?: string }).id ?? "", price: s.price, effectiveAt: s.effective_at })),
      availability: (a?.status as Availability | undefined) ?? null,
      availabilitySource: (a?.source as "computed" | "manual" | undefined) ?? null, availabilityAt: a?.updated_at ?? null,
      bookPct, minPct, suggestion: bookPct !== null && minPct !== null ? suggestedAvailability(bookPct, minPct) : null,
      avgCostCents: canSeeCost ? avgCostCents(costRows.filter((d) => tankIds.has(d.tank_id))) : null,
      publicPrice: pub?.price ?? null, publicAvailability: (pub?.availability as Availability | undefined) ?? null,
      publicUpdatedAt: pub?.availability_updated_at ?? pub?.price_updated_at ?? null,
    };
  });

  const productName = new Map(rows.map((r) => [r.id, r.name]));
  const history: HistoryRow[] = priceRows.slice(0, 40).map((r) => ({
    id: r.id, product: productName.get(r.product_id) ?? "", price: r.price, effectiveAt: r.effective_at,
    by: r.published_by ? nameOf.get(r.published_by) ?? "" : "", inForce: inForce.get(r.product_id)?.effective_at === r.effective_at && inForce.get(r.product_id)?.price === r.price,
  }));

  type RawShift = { id: string; attendant_id: string; opened_at: string; shift_legs: { ended_at: string | null; pumps: { number: number } | null }[] };
  const openShifts: OpenShift[] = ((shifts.data ?? []) as unknown as RawShift[]).map((s) => ({
    id: s.id, attendant: nameOf.get(s.attendant_id) ?? "", openedAt: s.opened_at,
    pumps: [...new Set(s.shift_legs.filter((l) => !l.ended_at).map((l) => l.pumps?.number ?? 0))].sort((a, b) => a - b),
  }));

  return {
    products: rows, history, openShifts,
    priceReports: { count: reports.count ?? 0, latest: reports.data?.[0]?.subject ?? null },
    stationStatus: station.data?.status ?? "",
    publicVisible: (publicView.data ?? []).length > 0,
    fetchedAt: new Date().toISOString(),
  };
}

// ---------- writes ----------
export type Outcome = { ok: true } | { ok: false; message: string };

const LOCAL: Record<string, string> = {
  FUELOS_PERMISSION_DENIED: "نشر الأسعار متاح لصاحب المحطة فقط",
};

function messageOf(e: { message?: string; code?: string } | null): string {
  const code = e?.message?.startsWith("FUELOS_") ? e.message.trim() : e?.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
  return (code && LOCAL[code]) || errorMessage(code);
}

/** Owner only. `effectiveAt` in the future schedules the price; null publishes it now. */
export async function publishPrice(stationId: string, productId: string, price: string, effectiveAt: string | null): Promise<Outcome> {
  const { error } = await supabase().rpc("publish_price", {
    p_station: stationId, p_product: productId, p_price: price, ...(effectiveAt ? { p_effective_at: effectiveAt } : {}),
  }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

/** Owner or shift manager (RLS). A manual choice carries its time and «يدوي» source, as the customer sees them. */
export async function setAvailability(stationId: string, productId: string, status: Availability, userId: string): Promise<Outcome> {
  const { error } = await supabase().from("product_availability").upsert({
    station_id: stationId, product_id: productId, status, source: "manual", updated_at: new Date().toISOString(), updated_by: userId,
  }, { onConflict: "station_id,product_id" }).abortSignal(signal());
  return error ? { ok: false, message: error.code === "42501" ? "تغيير التوفر متاح لصاحب المحطة ومدير المناوبة" : errorMessage(undefined) } : { ok: true };
}
