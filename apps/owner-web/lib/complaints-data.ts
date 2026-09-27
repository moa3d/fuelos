// O10 «شكاوى الزبائن والبلاغات». Owner/shift_manager only (RLS: complaints_read allows owner + shift_manager,
// not accountant). Replies and closing are plain table writes (complaints_station_update lets station staff set
// any status; complaint_messages_write now checks author_side matches who the caller actually is). Recording an
// invoice correction goes through record_invoice_correction() (owner/accountant — on this screen that means
// owner only, since accountant can't open it at all), which sets invoices.status = 'corrected' itself. There is
// still no invoice PDF regeneration (deferred to the Storage milestone — docs/briefs/04b-cowork-complaints.md).
// Overdue cases escalate to the platform automatically every 15 minutes (escalate_overdue_complaints, pg_cron);
// nothing here needs to trigger that.
import { errorMessage } from "@fuelos/core";
import type { ComplaintKind, ComplaintStatus } from "./complaint-rules";
import { supabase } from "./supabase";

type Num = number | string;
const signal = () => AbortSignal.timeout(20_000);

export type ComplaintRow = {
  id: string; customerId: string; customerName: string; kind: ComplaintKind; subject: string;
  status: ComplaintStatus; invoiceNumber: number | null; invoiceId: string | null;
  slaDueAt: string; createdAt: string; resolvedAt: string | null;
};

export type ComplaintsData = { complaints: ComplaintRow[]; fetchedAt: string };

const LIST_MAX = 200;

export async function loadComplaints(stationId: string): Promise<ComplaintsData> {
  const sb = supabase();
  const complaints = await sb.from("complaints")
    .select("id, customer_id, invoice_id, kind, subject, status, sla_due_at, created_at, resolved_at")
    .eq("station_id", stationId).order("created_at", { ascending: false }).limit(LIST_MAX).abortSignal(signal());
  if (complaints.error) throw new Error(complaints.error.message);

  const customerIds = [...new Set((complaints.data ?? []).map((c) => c.customer_id as string).filter(Boolean))];
  const invoiceIds = [...new Set((complaints.data ?? []).map((c) => c.invoice_id as string).filter(Boolean))];
  const [customersRes, invoicesRes] = await Promise.all([
    customerIds.length === 0 ? Promise.resolve({ data: [], error: null }) :
      sb.from("customers").select("id, full_name").in("id", customerIds).abortSignal(signal()),
    invoiceIds.length === 0 ? Promise.resolve({ data: [], error: null }) :
      sb.from("invoices").select("id, number").in("id", invoiceIds).abortSignal(signal()),
  ]);
  if (customersRes.error) throw new Error(customersRes.error.message);
  if (invoicesRes.error) throw new Error(invoicesRes.error.message);

  // a complaint's customer may not be readable here (customers RLS needs an invoice at this station) —
  // fall back to a generic label rather than hiding the case.
  const nameOf = new Map((customersRes.data ?? []).map((c) => [c.id as string, (c.full_name as string | null) ?? "زبون"]));
  const numberOf = new Map((invoicesRes.data ?? []).map((i) => [i.id as string, i.number as number]));

  const rows: ComplaintRow[] = (complaints.data ?? []).map((c) => ({
    id: c.id, customerId: c.customer_id, customerName: nameOf.get(c.customer_id) ?? "زبون",
    kind: c.kind as ComplaintKind, subject: c.subject, status: c.status as ComplaintStatus,
    invoiceId: c.invoice_id, invoiceNumber: c.invoice_id ? numberOf.get(c.invoice_id) ?? null : null,
    slaDueAt: c.sla_due_at, createdAt: c.created_at, resolvedAt: c.resolved_at,
  }));
  return { complaints: rows, fetchedAt: new Date().toISOString() };
}

// ---------- one complaint's detail (loaded on selection) ----------
export type Message = { id: number; authorSide: "customer" | "station" | "platform"; authorName: string; body: string; createdAt: string };
export type InvoiceDetail = {
  id: string; number: number; status: string; issuedAt: string; amount: Num; liters: Num; unitPrice: Num; product: string;
  corrections: { id: string; reason: string; amountDelta: Num; createdAt: string }[];
};
export type CustomerSummary = { customerSince: string | null; invoiceCount: number; loyaltyPoints: number };

export type ComplaintDetail = { messages: Message[]; invoice: InvoiceDetail | null; customer: CustomerSummary };

export async function loadComplaintDetail(stationId: string, row: ComplaintRow): Promise<ComplaintDetail> {
  const sb = supabase();
  const [messagesRes, members, customerRow, invoiceCount, loyalty, invoiceRes] = await Promise.all([
    sb.from("complaint_messages").select("id, author_id, author_side, body, created_at").eq("complaint_id", row.id).order("created_at").abortSignal(signal()),
    sb.from("station_members").select("user_id, display_name").eq("station_id", stationId).abortSignal(signal()),
    sb.from("customers").select("created_at").eq("id", row.customerId).abortSignal(signal()).maybeSingle(),
    sb.from("invoices").select("id", { count: "exact", head: true }).eq("station_id", stationId).eq("customer_id", row.customerId).abortSignal(signal()),
    sb.from("loyalty_ledger").select("points").eq("station_id", stationId).eq("customer_id", row.customerId).abortSignal(signal()),
    row.invoiceId
      ? sb.from("invoices").select("id, number, status, issued_at, sale_id").eq("id", row.invoiceId).abortSignal(signal()).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const failed = [messagesRes, members, customerRow, invoiceCount, loyalty, invoiceRes].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const nameOf = new Map((members.data ?? []).map((m) => [m.user_id as string, m.display_name as string]));
  const messages: Message[] = (messagesRes.data ?? []).map((m) => ({
    id: m.id, authorSide: m.author_side, body: m.body, createdAt: m.created_at,
    authorName: m.author_side === "station" ? nameOf.get(m.author_id) ?? "المحطة" : m.author_side === "platform" ? "منصة FuelOS" : row.customerName,
  }));

  let invoice: InvoiceDetail | null = null;
  if (invoiceRes.data) {
    const inv = invoiceRes.data as { id: string; number: number; status: string; issued_at: string; sale_id: string };
    const [saleRes, correctionsRes] = await Promise.all([
      sb.from("sales").select("amount, liters, unit_price, nozzle_id, received_at").eq("id", inv.sale_id).abortSignal(signal()).maybeSingle(),
      sb.from("invoice_corrections").select("id, reason, amount_delta, created_at").eq("invoice_id", inv.id).order("created_at").abortSignal(signal()),
    ]);
    if (saleRes.error) throw new Error(saleRes.error.message);
    if (correctionsRes.error) throw new Error(correctionsRes.error.message);
    let product = "";
    if (saleRes.data?.nozzle_id) {
      const nozzle = await sb.from("nozzles").select("tank_id").eq("id", saleRes.data.nozzle_id).abortSignal(signal()).maybeSingle();
      if (nozzle.data?.tank_id) {
        const tank = await sb.from("tanks").select("product_id").eq("id", nozzle.data.tank_id).abortSignal(signal()).maybeSingle();
        if (tank.data?.product_id) {
          const p = await sb.from("products").select("name").eq("id", tank.data.product_id).abortSignal(signal()).maybeSingle();
          product = p.data?.name ?? "";
        }
      }
    }
    invoice = {
      id: inv.id, number: inv.number, status: inv.status, issuedAt: inv.issued_at,
      amount: saleRes.data?.amount ?? 0, liters: saleRes.data?.liters ?? 0, unitPrice: saleRes.data?.unit_price ?? 0, product,
      corrections: (correctionsRes.data ?? []).map((c) => ({ id: c.id, reason: c.reason, amountDelta: c.amount_delta, createdAt: c.created_at })),
    };
  }

  return {
    messages, invoice,
    customer: {
      customerSince: customerRow.data?.created_at ?? null,
      invoiceCount: invoiceCount.count ?? 0,
      loyaltyPoints: (loyalty.data ?? []).reduce((s, l) => s + (l.points as number), 0),
    },
  };
}

// ---------- writes ----------
export type Outcome = { ok: true } | { ok: false; message: string };
const LOCAL: Record<string, string> = {
  FUELOS_PERMISSION_DENIED: "هذا الإجراء متاح لصاحب المحطة أو مدير المناوبة",
  "42501": "هذا الإجراء متاح لصاحب المحطة أو مدير المناوبة",
  FUELOS_REASON_REQUIRED: "اكتب سبب التصحيح",
  FUELOS_BAD_REQUEST: "هذه الفاتورة ملغاة ولا يمكن تصحيحها",
};
function messageOf(e: { message?: string; code?: string } | null): string {
  const code = e?.message?.startsWith("FUELOS_") ? e.message.trim() : e?.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
  return (code && LOCAL[code]) || errorMessage(code);
}

/** Sends the station's reply; a brand-new case moves to «قيد الرد» once the station has engaged with it. */
export async function sendReply(complaintId: string, authorId: string, body: string, wasOpen: boolean): Promise<Outcome> {
  const sb = supabase();
  const inserted = await sb.from("complaint_messages").insert({ complaint_id: complaintId, author_id: authorId, author_side: "station", body }).abortSignal(signal());
  if (inserted.error) return { ok: false, message: messageOf(inserted.error) };
  if (wasOpen) {
    const updated = await sb.from("complaints").update({ status: "awaiting_station" }).eq("id", complaintId).abortSignal(signal());
    if (updated.error) return { ok: false, message: messageOf(updated.error) };
  }
  return { ok: true };
}

export async function closeResolved(complaintId: string): Promise<Outcome> {
  const { error } = await supabase().from("complaints").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", complaintId).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

/** Records the correction and sets invoices.status = 'corrected' in one step (owner/accountant RLS). Doesn't
 * reissue the invoice file — no Storage/PDF capability yet. */
export async function recordInvoiceCorrection(invoiceId: string, reason: string, amountDelta: string): Promise<Outcome> {
  const { error } = await supabase().rpc("record_invoice_correction", { p_invoice: invoiceId, p_reason: reason, p_amount_delta: amountDelta }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}
