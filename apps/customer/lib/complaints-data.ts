// C7 «شكاواي». complaints_read/complaints_create RLS: customer_id = auth.uid(). Replying is a plain
// complaint_messages insert (author_side = 'customer', enforced server-side since brief 04b). A customer
// can't set a satisfaction rating — no such column exists yet (docs/briefs/04h-cowork-complaint-rating.md).
import { errorMessage } from "@fuelos/core";
import type { ComplaintKind, ComplaintStatus } from "./complaint-rules";
import { pickLastMessages, type LastMessage, type LastMessageRow } from "./complaints-rules";
import { supabase } from "./supabase";

const signal = () => AbortSignal.timeout(20_000);

export type ComplaintRow = {
  id: string; kind: ComplaintKind; subject: string; status: ComplaintStatus; stationName: string;
  invoiceNumber: number | null; createdAt: string; resolvedAt: string | null; lastMessage: LastMessage | null;
};
export type ComplaintsData = { complaints: ComplaintRow[]; fetchedAt: string };

export async function loadComplaints(customerId: string): Promise<ComplaintsData> {
  const sb = supabase();
  const complaints = await sb.from("complaints").select("id, station_id, invoice_id, kind, subject, status, created_at, resolved_at")
    .eq("customer_id", customerId).order("created_at", { ascending: false }).abortSignal(signal());
  if (complaints.error) throw new Error(complaints.error.message);

  const ids = (complaints.data ?? []).map((c) => c.id as string);
  const stationIds = [...new Set((complaints.data ?? []).map((c) => c.station_id as string))];
  const invoiceIds = (complaints.data ?? []).map((c) => c.invoice_id as string).filter(Boolean);
  const [stationsRes, invoicesRes, lastMessageByComplaint] = await Promise.all([
    stationIds.length === 0 ? { data: [], error: null } : sb.from("public_station_prices").select("station_id, station_name").in("station_id", stationIds).abortSignal(signal()),
    invoiceIds.length === 0 ? { data: [], error: null } : sb.from("invoices").select("id, number").in("id", invoiceIds).abortSignal(signal()),
    loadLastMessages(sb, ids),
  ]);
  if (stationsRes.error) throw new Error(stationsRes.error.message);
  if (invoicesRes.error) throw new Error(invoicesRes.error.message);

  const stationName = new Map<string, string>();
  for (const s of stationsRes.data ?? []) if (!stationName.has(s.station_id as string)) stationName.set(s.station_id as string, s.station_name as string);
  const invoiceNumber = new Map((invoicesRes.data ?? []).map((i) => [i.id as string, i.number as number]));

  return {
    complaints: (complaints.data ?? []).map((c) => ({
      id: c.id, kind: c.kind as ComplaintKind, subject: c.subject, status: c.status as ComplaintStatus,
      stationName: stationName.get(c.station_id as string) ?? "", invoiceNumber: c.invoice_id ? invoiceNumber.get(c.invoice_id as string) ?? null : null,
      createdAt: c.created_at, resolvedAt: c.resolved_at, lastMessage: lastMessageByComplaint.get(c.id as string) ?? null,
    })),
    fetchedAt: new Date().toISOString(),
  };
}

// A failed `complaint_messages` query must not fail the whole page — the list falls back to showing
// `subject` (see the card rendering in the complaints page) for every complaint when this happens.
async function loadLastMessages(sb: ReturnType<typeof supabase>, ids: string[]): Promise<Map<string, LastMessage | null>> {
  if (ids.length === 0) return new Map();
  try {
    const { data, error } = await sb.from("complaint_messages").select("complaint_id, author_side, body, created_at")
      .in("complaint_id", ids).order("created_at", { ascending: false }).abortSignal(signal());
    if (error) return new Map();
    const rows: LastMessageRow[] = (data ?? []).map((m) => ({ complaintId: m.complaint_id as string, authorSide: m.author_side, body: m.body, createdAt: m.created_at }));
    return pickLastMessages(rows, ids);
  } catch {
    return new Map();
  }
}

// For the real `/complaints/[id]` route (no in-memory row from the list). RLS already scopes `complaints` to
// the caller, so the `.eq("customer_id", ...)` here is belt-and-suspenders; a missing/foreign row and a
// genuinely nonexistent id both resolve to `null` → the page's "لم نجد هذه الشكوى" state. No `lastMessage`
// needed here — the conversation itself comes from `loadComplaintMessages`.
export async function loadComplaint(customerId: string, id: string): Promise<ComplaintRow | null> {
  const sb = supabase();
  const complaint = await sb.from("complaints").select("id, station_id, invoice_id, kind, subject, status, created_at, resolved_at")
    .eq("customer_id", customerId).eq("id", id).abortSignal(signal()).maybeSingle();
  if (complaint.error) throw new Error(complaint.error.message);
  if (!complaint.data) return null;
  const c = complaint.data;

  const [stationRes, invoiceRes] = await Promise.all([
    sb.from("public_station_prices").select("station_id, station_name").eq("station_id", c.station_id as string).limit(1).abortSignal(signal()),
    c.invoice_id ? sb.from("invoices").select("id, number").eq("id", c.invoice_id as string).abortSignal(signal()) : Promise.resolve({ data: [] as { id: string; number: number }[], error: null }),
  ]);
  if (stationRes.error) throw new Error(stationRes.error.message);
  if (invoiceRes.error) throw new Error(invoiceRes.error.message);

  return {
    id: c.id, kind: c.kind as ComplaintKind, subject: c.subject, status: c.status as ComplaintStatus,
    stationName: stationRes.data?.[0]?.station_name ?? "",
    invoiceNumber: c.invoice_id ? invoiceRes.data?.[0]?.number ?? null : null,
    createdAt: c.created_at, resolvedAt: c.resolved_at, lastMessage: null,
  };
}

export type Message = { id: number; authorSide: "customer" | "station" | "platform"; body: string; createdAt: string };

export async function loadComplaintMessages(complaintId: string): Promise<Message[]> {
  const { data, error } = await supabase().from("complaint_messages").select("id, author_side, body, created_at").eq("complaint_id", complaintId).order("created_at").abortSignal(signal());
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({ id: m.id, authorSide: m.author_side, body: m.body, createdAt: m.created_at }));
}

export type StationOption = { id: string; name: string };
export async function loadStationOptions(): Promise<StationOption[]> {
  const { data, error } = await supabase().from("public_station_prices").select("station_id, station_name").abortSignal(signal());
  if (error) throw new Error(error.message);
  const seen = new Map<string, string>();
  for (const r of data ?? []) if (!seen.has(r.station_id as string)) seen.set(r.station_id as string, r.station_name as string);
  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

// ---------- writes ----------
export type Outcome = { ok: true; id?: string } | { ok: false; message: string };
function messageOf(e: { message?: string; code?: string } | null): string {
  const code = e?.message?.startsWith("FUELOS_") ? e.message.trim() : undefined;
  return errorMessage(code) || "تعذّر الإرسال — حاول مرة أخرى";
}

export async function fileComplaint(customerId: string, stationId: string, kind: ComplaintKind, subject: string): Promise<Outcome> {
  const sb = supabase();
  const created = await sb.from("complaints").insert({ station_id: stationId, customer_id: customerId, kind, subject }).select("id").abortSignal(signal()).single();
  if (created.error) return { ok: false, message: messageOf(created.error) };
  const msg = await sb.from("complaint_messages").insert({ complaint_id: created.data.id, author_id: customerId, author_side: "customer", body: subject }).abortSignal(signal());
  return msg.error ? { ok: false, message: messageOf(msg.error) } : { ok: true, id: created.data.id };
}

export async function replyToComplaint(complaintId: string, customerId: string, body: string): Promise<Outcome> {
  const { error } = await supabase().from("complaint_messages").insert({ complaint_id: complaintId, author_id: customerId, author_side: "customer", body }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}
