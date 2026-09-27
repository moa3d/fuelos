// O5 «العملاء والديون». Company accounts carry credit (سائق/مركبة/حد ائتماني — glossary); individual customers
// pay at the pump and carry no station credit, so they get a lighter read-only view. The balance/aging math
// mirrors company_balance() on the server (fifoAging in company-rules.ts); freezing/suspending and adding a
// driver or vehicle are plain table writes under RLS (owner/accountant), same pattern as O9's availability.
import { errorMessage } from "@fuelos/core";
import { fifoAging, overdueDays, utilizationPercent, type CompanyStatus } from "./company-rules";
import { supabase } from "./supabase";

type Num = number | string;
const signal = () => AbortSignal.timeout(20_000);

export type Driver = { id: string; name: string; phone: string | null; authorized: boolean };
export type Vehicle = { id: string; plate: string; label: string | null; active: boolean };
export type Txn = { id: string; kind: "sale" | "payment"; amount: Num; at: string; status?: string; note?: string | null };

export type Company = {
  id: string; name: string; status: CompanyStatus; creditLimit: Num; billingDay: number; qrToken: string | null;
  drivers: Driver[]; vehicles: Vehicle[]; txns: Txn[];
  remainingCents: bigint; balanceCents: bigint; overdueDays: number | null; utilPct: number;
};

export type CustomerRow = { id: string; name: string; phone: string | null; invoiceCount: number; totalCents: bigint };

export type CustomersData = { companies: Company[]; customers: CustomerRow[]; fetchedAt: string };

export async function loadCustomers(stationId: string): Promise<CustomersData> {
  const sb = supabase();
  const [companiesRes, driversRes, vehiclesRes, salesRes, paymentsRes] = await Promise.all([
    sb.from("company_accounts").select("id, name, status, credit_limit, billing_day, qr_token").eq("station_id", stationId).order("name").abortSignal(signal()),
    sb.from("company_drivers").select("id, company_account_id, full_name, phone, is_authorized").abortSignal(signal()),
    sb.from("vehicles").select("id, company_account_id, plate, label, is_active").not("company_account_id", "is", null).abortSignal(signal()),
    sb.from("sales").select("id, company_account_id, amount, status, received_at").eq("station_id", stationId).eq("payment_method", "credit").neq("status", "voided").limit(2000).abortSignal(signal()),
    sb.from("company_payments").select("id, company_account_id, amount, received_at, note").limit(2000).abortSignal(signal()),
  ]);
  const failed = [companiesRes, driversRes, vehiclesRes, salesRes, paymentsRes].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const now = Date.now();

  const companies: Company[] = (companiesRes.data ?? []).map((c) => {
    const sales = (salesRes.data ?? []).filter((s) => s.company_account_id === c.id);
    const payments = (paymentsRes.data ?? []).filter((p) => p.company_account_id === c.id);
    const { unpaid, totalCents: balanceCents } = fifoAging(
      sales.map((s) => ({ amount: s.amount, at: s.received_at })), payments.map((p) => ({ amount: p.amount, at: p.received_at })),
    );
    const limitCents = toCents(c.credit_limit);
    const remainingCents = limitCents - balanceCents > 0n ? limitCents - balanceCents : 0n;
    const txns: Txn[] = [
      ...sales.map((s): Txn => ({ id: s.id, kind: "sale", amount: s.amount, at: s.received_at, status: s.status })),
      ...payments.map((p): Txn => ({ id: p.id, kind: "payment", amount: p.amount, at: p.received_at, note: p.note })),
    ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return {
      id: c.id, name: c.name, status: c.status as CompanyStatus, creditLimit: c.credit_limit, billingDay: c.billing_day, qrToken: c.qr_token,
      drivers: (driversRes.data ?? []).filter((d) => d.company_account_id === c.id).map((d) => ({ id: d.id, name: d.full_name, phone: d.phone, authorized: d.is_authorized })),
      vehicles: (vehiclesRes.data ?? []).filter((v) => v.company_account_id === c.id).map((v) => ({ id: v.id, plate: v.plate, label: v.label, active: v.is_active })),
      txns, remainingCents, balanceCents, overdueDays: overdueDays(unpaid, now), utilPct: utilizationPercent(remainingCents, limitCents),
    };
  });

  // individuals: customers who have at least one invoice at this station (no credit; read-only summary)
  const invRes = await sb.from("invoices").select("customer_id, sale_id, status").eq("station_id", stationId).not("customer_id", "is", null).limit(2000).abortSignal(signal());
  if (invRes.error) throw new Error(invRes.error.message);
  const custIds = [...new Set((invRes.data ?? []).map((i) => i.customer_id as string))];
  const [customersRes, saleAmounts] = custIds.length === 0 ? [{ data: [], error: null }, { data: [], error: null }] : await Promise.all([
    sb.from("customers").select("id, full_name, phone").in("id", custIds).abortSignal(signal()),
    sb.from("sales").select("id, amount").in("id", (invRes.data ?? []).map((i) => i.sale_id)).abortSignal(signal()),
  ]);
  if (customersRes.error || saleAmounts.error) throw new Error((customersRes.error ?? saleAmounts.error)!.message);
  const amountOf = new Map((saleAmounts.data ?? []).map((s) => [s.id as string, s.amount as Num]));
  const customers: CustomerRow[] = (customersRes.data ?? []).map((c) => {
    const invoices = (invRes.data ?? []).filter((i) => i.customer_id === c.id);
    return {
      id: c.id, name: c.full_name ?? "بلا اسم", phone: c.phone, invoiceCount: invoices.length,
      totalCents: invoices.reduce((sum, i) => sum + toCents(amountOf.get(i.sale_id) ?? 0), 0n),
    };
  });

  return { companies, customers, fetchedAt: new Date().toISOString() };
}

function toCents(v: Num): bigint {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?/.exec(String(v).trim());
  if (!m) return 0n;
  const c = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -c : c;
}

// ---------- writes ----------
export type Outcome = { ok: true } | { ok: false; message: string };
const LOCAL: Record<string, string> = { FUELOS_PERMISSION_DENIED: "هذا الإجراء متاح لصاحب المحطة أو المحاسب فقط" };
function messageOf(e: { message?: string; code?: string } | null): string {
  const code = e?.message?.startsWith("FUELOS_") ? e.message.trim() : e?.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
  return (code && LOCAL[code]) || errorMessage(code);
}

export async function createCompany(stationId: string, name: string, creditLimit: string, billingDay: number): Promise<Outcome> {
  const { error } = await supabase().from("company_accounts").insert({
    station_id: stationId, name, credit_limit: creditLimit, billing_day: billingDay,
  }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

export async function setCompanyStatus(companyId: string, status: CompanyStatus): Promise<Outcome> {
  const { error } = await supabase().from("company_accounts").update({ status }).eq("id", companyId).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

export async function addDriver(companyId: string, name: string, phone: string | null): Promise<Outcome> {
  const { error } = await supabase().from("company_drivers").insert({ company_account_id: companyId, full_name: name, phone }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

export async function setDriverAuthorized(driverId: string, authorized: boolean): Promise<Outcome> {
  const { error } = await supabase().from("company_drivers").update({ is_authorized: authorized }).eq("id", driverId).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

export async function addVehicle(companyId: string, plate: string, label: string | null): Promise<Outcome> {
  const { error } = await supabase().from("vehicles").insert({ company_account_id: companyId, plate, label }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

export async function setVehicleActive(vehicleId: string, active: boolean): Promise<Outcome> {
  const { error } = await supabase().from("vehicles").update({ is_active: active }).eq("id", vehicleId).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

/** Owner or accountant. Multi-table (payment + ledger entry), so it goes through the RPC. */
export async function recordPayment(companyId: string, amount: string, paidTo: "cash" | "bank", note: string | null): Promise<Outcome> {
  const { error } = await supabase().rpc("record_company_payment", { p_company: companyId, p_amount: amount, p_paid_to: paidTo, p_note: note }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}
