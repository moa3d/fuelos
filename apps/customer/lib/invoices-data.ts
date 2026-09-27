// C3 «فواتيري» + C4 «تفاصيل الفاتورة». Everything here is read-only under invoices_read/sales_read/
// loyalty_read RLS (customer_id = auth.uid()) except filing a complaint from an invoice, a plain insert under
// complaints_create + complaint_messages_write (both customer-scoped). No RPC needed for any of this.
// Station name/currency come from public_station_prices, not the stations table directly — a customer isn't
// a station member, so `stations` itself is not RLS-readable to them (found by a read-only probe against the
// live project); public_station_prices is the one owner-rights view meant for exactly this. The fuel product
// name has no such customer-safe path yet (nozzles/tanks/products all require station membership too), so it
// shows as "—" rather than guessed — see docs/briefs/04e-cowork-customer-product-name.md.
import { errorMessage } from "@fuelos/core";
import type { InvoiceStatus } from "./invoice-rules";
import { currencyLabel } from "./prices-rules";
import { supabase } from "./supabase";

type Num = number | string;
const signal = () => AbortSignal.timeout(20_000);

export type InvoiceRow = {
  id: string; number: number; status: InvoiceStatus; issuedAt: string; stationId: string; stationName: string; currency: string;
  amount: Num; liters: Num; unitPrice: Num; product: string; vehicleId: string | null; vehicleLabel: string | null;
};
export type VehicleOption = { id: string; label: string };
export type InvoicesData = {
  invoices: InvoiceRow[]; vehicles: VehicleOption[]; pointsThisMonth: number; fetchedAt: string;
};

export async function loadInvoices(customerId: string, monthStart: string, monthEnd: string): Promise<InvoicesData> {
  const sb = supabase();
  const [invoicesRes, vehiclesRes] = await Promise.all([
    sb.from("invoices").select("id, number, status, issued_at, station_id, sale_id")
      .eq("customer_id", customerId).gte("issued_at", monthStart).lt("issued_at", monthEnd)
      .order("issued_at", { ascending: false }).abortSignal(signal()),
    sb.from("vehicles").select("id, plate, label").eq("customer_id", customerId).eq("is_active", true).order("created_at").abortSignal(signal()),
  ]);
  if (invoicesRes.error) throw new Error(invoicesRes.error.message);
  if (vehiclesRes.error) throw new Error(vehiclesRes.error.message);

  const saleIds = (invoicesRes.data ?? []).map((i) => i.sale_id as string);
  const stationIds = [...new Set((invoicesRes.data ?? []).map((i) => i.station_id as string))];
  const invoiceIds = (invoicesRes.data ?? []).map((i) => i.id as string);
  const [salesRes, stationInfo, loyaltyRes] = await Promise.all([
    saleIds.length === 0 ? { data: [], error: null } :
      sb.from("sales").select("id, amount, liters, unit_price, nozzle_id, vehicle_id").in("id", saleIds).abortSignal(signal()),
    stationInfoByIds(stationIds),
    invoiceIds.length === 0 ? { data: [], error: null } :
      sb.from("loyalty_ledger").select("points").in("invoice_id", invoiceIds).abortSignal(signal()),
  ]);
  if (salesRes.error) throw new Error(salesRes.error.message);
  if (loyaltyRes.error) throw new Error(loyaltyRes.error.message);

  const saleOf = new Map((salesRes.data ?? []).map((s) => [s.id as string, s]));
  const vehicleOf = new Map((vehiclesRes.data ?? []).map((v) => [v.id as string, v]));

  const invoices: InvoiceRow[] = (invoicesRes.data ?? []).map((i) => {
    const sale = saleOf.get(i.sale_id as string);
    const vehicle = sale?.vehicle_id ? vehicleOf.get(sale.vehicle_id as string) : undefined;
    const station = stationInfo.get(i.station_id as string);
    return {
      id: i.id, number: i.number, status: i.status as InvoiceStatus, issuedAt: i.issued_at,
      stationId: i.station_id, stationName: station?.name ?? "", currency: station?.currency ?? "ل.س",
      amount: sale?.amount ?? 0, liters: sale?.liters ?? 0, unitPrice: sale?.unit_price ?? 0,
      product: "", // no customer-safe way to resolve nozzle_id → product name yet, see the header note
      vehicleId: (sale?.vehicle_id as string) ?? null, vehicleLabel: vehicle ? (vehicle.label as string) || (vehicle.plate as string) : null,
    };
  });

  return {
    invoices,
    vehicles: (vehiclesRes.data ?? []).map((v) => ({ id: v.id as string, label: (v.label as string) || (v.plate as string) })),
    pointsThisMonth: (loyaltyRes.data ?? []).reduce((s, l) => s + (l.points as number), 0),
    fetchedAt: new Date().toISOString(),
  };
}

async function stationInfoByIds(stationIds: string[]): Promise<Map<string, { name: string; currency: string }>> {
  if (stationIds.length === 0) return new Map();
  const { data, error } = await supabase().from("public_station_prices").select("station_id, station_name, currency_code").in("station_id", stationIds).abortSignal(signal());
  if (error) throw new Error(error.message);
  const map = new Map<string, { name: string; currency: string }>();
  for (const r of data ?? []) if (!map.has(r.station_id as string)) map.set(r.station_id as string, { name: r.station_name as string, currency: currencyLabel(r.currency_code as string) });
  return map;
}

// ---------- one invoice's detail ----------
export type LoyaltyEntry = { points: number; runningBalance: number };
export type InvoiceDetail = InvoiceRow & {
  paymentMethod: string; odometerKm: number | null; plate: string | null; loyalty: LoyaltyEntry | null;
  corrections: { id: string; reason: string; amountDelta: Num; createdAt: string }[];
};

const PAYMENT_LABEL: Record<string, string> = { cash: "نقدي", card: "بطاقة", credit: "آجل", voucher: "قسيمة" };

export async function loadInvoiceDetail(customerId: string, invoiceId: string): Promise<InvoiceDetail> {
  const sb = supabase();
  const inv = await sb.from("invoices").select("id, number, status, issued_at, station_id, sale_id").eq("id", invoiceId).abortSignal(signal()).single();
  if (inv.error) throw new Error(inv.error.message);
  const [sale, stationInfo, corrections, ledger, allLedger] = await Promise.all([
    sb.from("sales").select("amount, liters, unit_price, payment_method, nozzle_id, vehicle_id, odometer_km").eq("id", inv.data.sale_id).abortSignal(signal()).single(),
    stationInfoByIds([inv.data.station_id as string]),
    sb.from("invoice_corrections").select("id, reason, amount_delta, created_at").eq("invoice_id", invoiceId).order("created_at").abortSignal(signal()),
    sb.from("loyalty_ledger").select("points").eq("invoice_id", invoiceId).abortSignal(signal()).maybeSingle(),
    sb.from("loyalty_ledger").select("points").eq("customer_id", customerId).abortSignal(signal()),
  ]);
  if (sale.error) throw new Error(sale.error.message);
  if (corrections.error) throw new Error(corrections.error.message);
  if (allLedger.error) throw new Error(allLedger.error.message);
  const station = stationInfo.get(inv.data.station_id as string);

  let vehicle: { plate: string; label: string | null } | null = null;
  if (sale.data.vehicle_id) {
    const v = await sb.from("vehicles").select("plate, label").eq("id", sale.data.vehicle_id).abortSignal(signal()).maybeSingle();
    if (v.data) vehicle = v.data;
  }
  // no customer-safe way to resolve nozzle_id → product name yet, see the header note
  const product = "";

  // «الرصيد» on C4 is the customer's current total, same number C6 shows — not a point-in-time snapshot.
  const runningBalance = (allLedger.data ?? []).reduce((s, l) => s + (l.points as number), 0);
  const thisEntryPoints = ledger.data?.points ?? null;

  return {
    id: inv.data.id, number: inv.data.number, status: inv.data.status as InvoiceStatus, issuedAt: inv.data.issued_at,
    stationId: inv.data.station_id, stationName: station?.name ?? "", currency: station?.currency ?? "ل.س",
    amount: sale.data.amount, liters: sale.data.liters, unitPrice: sale.data.unit_price,
    product, vehicleId: sale.data.vehicle_id, vehicleLabel: vehicle ? vehicle.label || vehicle.plate : null,
    paymentMethod: PAYMENT_LABEL[sale.data.payment_method as string] ?? sale.data.payment_method,
    odometerKm: sale.data.odometer_km, plate: vehicle?.plate ?? null,
    loyalty: thisEntryPoints !== null ? { points: thisEntryPoints, runningBalance } : null,
    corrections: (corrections.data ?? []).map((c) => ({ id: c.id, reason: c.reason, amountDelta: c.amount_delta, createdAt: c.created_at })),
  };
}

// ---------- file a complaint/correction request from an invoice ----------
export type Outcome = { ok: true } | { ok: false; message: string };
const LOCAL: Record<string, string> = { FUELOS_PERMISSION_DENIED: "تعذّر إرسال الطلب", "42501": "تعذّر إرسال الطلب" };
function messageOf(e: { message?: string; code?: string } | null): string {
  const code = e?.message?.startsWith("FUELOS_") ? e.message.trim() : e?.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
  return (code && LOCAL[code]) || errorMessage(code);
}

export async function fileInvoiceComplaint(customerId: string, stationId: string, invoiceId: string, subject: string): Promise<Outcome> {
  const sb = supabase();
  const created = await sb.from("complaints").insert({ station_id: stationId, customer_id: customerId, invoice_id: invoiceId, kind: "complaint", subject }).select("id").abortSignal(signal()).single();
  if (created.error) return { ok: false, message: messageOf(created.error) };
  const msg = await sb.from("complaint_messages").insert({ complaint_id: created.data.id, author_id: customerId, author_side: "customer", body: subject }).abortSignal(signal());
  return msg.error ? { ok: false, message: messageOf(msg.error) } : { ok: true };
}
