// O7 «الموافقات»: reads the approval requests of a station with what the owner needs to decide, and sends the
// decision through decide_approval() (+ reopen_shift() for «إعادة للعامل للتصحيح»). Rules: lib/approval-rules.ts.
import { errorMessage } from "@fuelos/core";
import { planFor, type ApprovalType, type Choice } from "./approval-rules";
import { supabase } from "./supabase";

type Num = number | string;

export type Leg = {
  leg_id?: string; pump_number: number; started_at: string; ended_at: string | null; gap_note: string | null; liters: Num; amount: Num;
};
export type CloseSnapshot = {
  liters?: Num; meter_sales?: Num; card?: Num; credit?: Num; voucher?: Num;
  opening_cash?: Num; expected_cash?: Num; counted_cash?: Num | null; cash_diff?: Num | null;
  legs?: Leg[];
};

export type Request = {
  id: string;
  type: ApprovalType;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  requestedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionOption: string | null;
  decisionNote: string | null;
  refId: string | null;
  payload: Record<string, unknown>;
  shift?: {
    id: string; status: string; attendant: string; openedAt: string; closedAt: string | null;
    diffReason: string | null; products: string[]; pumps: number[];
  };
  sale?: {
    id: string; shiftId: string; status: string; liters: Num; unitPrice: Num; amount: Num; product: string; company: string;
  };
  tank?: { name: string; product: string };
  /** for a shift close: requests for its over-limit credit fills that still wait for a decision */
  blockingCredit: string[];
};

export type ApprovalsData = { requests: Request[]; cashToleranceCents: bigint; fetchedAt: string };

const signal = () => AbortSignal.timeout(20_000);

export async function loadApprovals(stationId: string): Promise<ApprovalsData> {
  const sb = supabase();
  const [reqs, members, tanks, products, station] = await Promise.all([
    sb.from("approval_requests")
      .select("id, type, status, requested_at, requested_by, decided_by, decided_at, decision_option, decision_note, ref_id, payload")
      .eq("station_id", stationId).order("requested_at", { ascending: false }).limit(100).abortSignal(signal()),
    sb.from("station_members").select("user_id, display_name").eq("station_id", stationId).abortSignal(signal()),
    sb.from("tanks").select("id, name, product_id").eq("station_id", stationId).abortSignal(signal()),
    sb.from("products").select("id, name").eq("station_id", stationId).abortSignal(signal()),
    sb.from("stations").select("cash_tolerance").eq("id", stationId).abortSignal(signal()).maybeSingle(),
  ]);
  const failed = [reqs, members, tanks, products, station].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const nameOf = new Map((members.data ?? []).map((m) => [m.user_id as string, m.display_name as string]));
  const productName = new Map((products.data ?? []).map((p) => [p.id as string, p.name as string]));
  const tankInfo = new Map((tanks.data ?? []).map((t) => [t.id as string, { name: t.name as string, product: productName.get(t.product_id) ?? "" }]));
  const rows = reqs.data ?? [];

  const shiftIds = rows.filter((r) => r.type === "shift_close" && r.ref_id).map((r) => r.ref_id as string);
  const saleIds = rows.filter((r) => r.type === "credit_over_limit" && r.ref_id).map((r) => r.ref_id as string);

  const [shiftsRes, salesRes] = await Promise.all([
    shiftIds.length === 0 ? { data: [], error: null } :
      sb.from("shifts")
        .select("id, status, attendant_id, opened_at, closed_at, diff_reason, shift_legs(pumps(number), leg_readings(nozzles(tank_id)))")
        .in("id", shiftIds).abortSignal(signal()),
    saleIds.length === 0 ? { data: [], error: null } :
      sb.from("sales").select("id, shift_id, status, liters, unit_price, amount, nozzles(tank_id)").in("id", saleIds).abortSignal(signal()),
  ]);
  if (shiftsRes.error || salesRes.error) throw new Error((shiftsRes.error ?? salesRes.error)!.message);

  type RawShift = {
    id: string; status: string; attendant_id: string; opened_at: string; closed_at: string | null; diff_reason: string | null;
    shift_legs: { pumps: { number: number } | null; leg_readings: { nozzles: { tank_id: string } | null }[] }[];
  };
  const shifts = new Map(((shiftsRes.data ?? []) as unknown as RawShift[]).map((s) => [s.id, {
    id: s.id, status: s.status, attendant: nameOf.get(s.attendant_id) ?? "", openedAt: s.opened_at, closedAt: s.closed_at,
    diffReason: s.diff_reason,
    pumps: [...new Set(s.shift_legs.map((l) => l.pumps?.number ?? 0))],
    products: [...new Set(s.shift_legs.flatMap((l) => l.leg_readings.map((r) => tankInfo.get(r.nozzles?.tank_id ?? "")?.product ?? "")))].filter(Boolean),
  }]));
  type RawSale = { id: string; shift_id: string; status: string; liters: Num; unit_price: Num; amount: Num; nozzles: { tank_id: string } | null };
  const salesById = new Map(((salesRes.data ?? []) as unknown as RawSale[]).map((s) => [s.id, s]));

  const requests: Request[] = rows.map((r) => {
    const payload = (r.payload ?? {}) as Record<string, unknown>;
    const sale = r.type === "credit_over_limit" && r.ref_id ? salesById.get(r.ref_id) : undefined;
    const tankId = r.type === "stock_adjustment" ? (payload.tank_id as string | undefined) : undefined;
    return {
      id: r.id, type: r.type, status: r.status, requestedAt: r.requested_at,
      requestedBy: nameOf.get(r.requested_by) ?? "",
      decidedBy: r.decided_by ? nameOf.get(r.decided_by) ?? "" : null, decidedAt: r.decided_at,
      decisionOption: r.decision_option, decisionNote: r.decision_note,
      refId: r.ref_id, payload,
      shift: r.type === "shift_close" && r.ref_id ? shifts.get(r.ref_id) : undefined,
      sale: sale && {
        id: sale.id, shiftId: sale.shift_id, status: sale.status, liters: sale.liters, unitPrice: sale.unit_price, amount: sale.amount,
        product: tankInfo.get(sale.nozzles?.tank_id ?? "")?.product ?? "", company: String(payload.company ?? ""),
      },
      tank: tankId ? tankInfo.get(tankId) : undefined,
      blockingCredit: [],
    };
  });

  // a shift close cannot be approved before the over-limit credit fills of that shift are decided
  for (const r of requests) {
    if (r.type !== "shift_close" || r.status !== "pending" || !r.refId) continue;
    r.blockingCredit = requests
      .filter((c) => c.type === "credit_over_limit" && c.status === "pending" && c.sale?.shiftId === r.refId)
      .map((c) => c.id);
  }

  return { requests, cashToleranceCents: centsOf(station.data?.cash_tolerance ?? 0), fetchedAt: new Date().toISOString() };
}

export type DecisionResult =
  | { ok: true }
  | { ok: false; message: string }
  /** the close was rejected but the shift could not be reopened: the owner can retry from the processed list */
  | { ok: false; message: string; reopenFailed: true };

const DECISION_MESSAGES: Record<string, string> = {
  FUELOS_NOT_FOUND: "لم يعد هذا الطلب بانتظار قرار — ربما قرّره شخص آخر. حدّث الصفحة.",
  FUELOS_REASON_REQUIRED: "اكتب السبب أولاً — الرفض والإعادة يحتاجان ملاحظة.",
  FUELOS_PENDING_APPROVALS: "هناك عمليات آجل بانتظار قرارك في هذه المناوبة — قرّرها أولاً ثم اعتمد الإغلاق.",
  FUELOS_PERIOD_CLOSED: "الفترة المحاسبية مغلقة — سجّل التسوية في الفترة الحالية.",
};

function messageOf(e: { message?: string; code?: string; details?: string | null } | null): string {
  const code = e?.message?.startsWith("FUELOS_") ? e.message.trim() : e?.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
  return (code && DECISION_MESSAGES[code]) || errorMessage(code);
}

export async function decide(req: Request, choice: Choice, note: string): Promise<DecisionResult> {
  const plan = planFor(choice);
  const trimmed = note.trim();
  const { error } = await supabase().rpc("decide_approval", {
    p_request: req.id, p_approve: plan.approve, p_option: plan.option, p_note: trimmed === "" ? null : trimmed,
  }).abortSignal(signal());
  if (error) return { ok: false, message: messageOf(error) };
  if (plan.reopenAfter && req.refId) {
    const reopen = await reopenShift(req.refId, trimmed);
    if (!reopen.ok) {
      return { ok: false, reopenFailed: true, message: `رُفض الإغلاق، لكن تعذّرت إعادة فتح المناوبة: ${reopen.message}` };
    }
  }
  return { ok: true };
}

/** Owner only. A rejected close → the attendant's shift is open again (their last leg is reopened). */
export async function reopenShift(shiftId: string, reason: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase().rpc("reopen_shift", { p_shift: shiftId, p_reason: reason }).abortSignal(signal());
  if (!error) return { ok: true };
  const code = error.message?.startsWith("FUELOS_") ? error.message.trim() : undefined;
  const local: Record<string, string> = {
    FUELOS_PUMP_BUSY: "المضخة الأخيرة صارت مع عامل آخر",
    FUELOS_SHIFT_ALREADY_OPEN: "للعامل مناوبة أخرى مفتوحة",
    FUELOS_BAD_SHIFT_TRANSITION: "حالة المناوبة لا تسمح بإعادة الفتح",
  };
  return { ok: false, message: (code && local[code]) || messageOf(error) };
}

function centsOf(v: Num): bigint {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?/.exec(String(v).trim());
  if (!m) return 0n;
  const c = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -c : c;
}
