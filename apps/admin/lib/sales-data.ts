// A5 «مبيعات المحطات» (docs/briefs/08a): platform_sales_summary() is the only source for these numbers — the
// admin app cannot read shifts/sales directly (RLS keeps a station's financials to its own members), and this
// screen computes nothing financial itself beyond sorting/formatting what the RPC already aggregated.
import { errorMessage } from "@fuelos/core";
import type { SubStatus } from "./dashboard-rules.ts";
import { cents } from "./money.ts";
import type { SalesRow, SalesTotals } from "./sales-rules.ts";
import type { StationStatus } from "./stations-rules.ts";
import { supabase } from "./supabase.ts";

const signal = () => AbortSignal.timeout(30_000);

type Num = number | string;
type RawRow = {
  station_id: string; station_name: string; organization_name: string; city: string | null;
  station_status: StationStatus; plan_name: string | null; subscription_status: SubStatus | null;
  approved_shifts: Num; liters: Num; sales_amount: Num;
  cash_amount: Num; card_amount: Num; credit_amount: Num; voucher_amount: Num;
  last_approved_shift_at: string | null; last_device_sync_at: string | null; device_count: Num;
};
type RawTotals = {
  approved_shifts: Num; liters: Num; sales_amount: Num;
  cash_amount: Num; card_amount: Num; credit_amount: Num; voucher_amount: Num;
};
type RawResponse = { rows: RawRow[]; totals: RawTotals };

function toRow(r: RawRow): SalesRow {
  return {
    stationId: r.station_id, stationName: r.station_name, organizationName: r.organization_name, city: r.city,
    stationStatus: r.station_status, planName: r.plan_name, subscriptionStatus: r.subscription_status,
    approvedShifts: Number(r.approved_shifts), litersL: Number(r.liters),
    salesCents: cents(r.sales_amount), cashCents: cents(r.cash_amount), cardCents: cents(r.card_amount),
    creditCents: cents(r.credit_amount), voucherCents: cents(r.voucher_amount),
    lastApprovedShiftAt: r.last_approved_shift_at, lastDeviceSyncAt: r.last_device_sync_at,
    deviceCount: Number(r.device_count),
  };
}

function toTotals(t: RawTotals): SalesTotals {
  return {
    approvedShifts: Number(t.approved_shifts), litersL: Number(t.liters), salesCents: cents(t.sales_amount),
    cashCents: cents(t.cash_amount), cardCents: cents(t.card_amount), creditCents: cents(t.credit_amount), voucherCents: cents(t.voucher_amount),
  };
}

export type PlatformSales = { rows: SalesRow[]; totals: SalesTotals; fetchedAt: string };

export async function loadPlatformSales(from: string, to: string): Promise<PlatformSales> {
  const { data, error } = await supabase().rpc("platform_sales_summary", { p_from: from, p_to: to }).abortSignal(signal());
  if (error) {
    const code = error.message?.startsWith("FUELOS_") ? error.message.trim() : error.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
    throw new Error(code ? errorMessage(code) : "تعذّر تحميل المبيعات");
  }
  const r = data as RawResponse;
  return { rows: (r.rows ?? []).map(toRow), totals: toTotals(r.totals), fetchedAt: new Date().toISOString() };
}
