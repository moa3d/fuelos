"use client";
// O4 — القيود المحاسبية (design/screens/O4.png). Owner/accountant only (RLS: is_finance). Manual entries have no
// RPC: insert a draft, insert its lines, then flip the entry's own status to «posted» — a trigger validates the
// balance and assigns the number (see lib/journal-data.ts). Posted entries are immutable; corrections are
// reversals with a reason (reverse_journal_entry). «تصدير» has no server capability yet — disabled, Cowork request.
import { formatMoney, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, Input, StatusBadge, TextArea } from "@fuelos/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  closePeriod, deleteDraftEntry, loadAuditTrail, loadJournal, postDraftEntry, reverseEntry, saveManualEntry,
  sourceLabel, SOURCE_HREF, type Account, type AuditRow, type Entry, type JournalData, type Outcome,
} from "@/lib/journal-data";
import {
  canCloseperiod, canManage, entryBadge, isBalanced, matchesScope, SCOPE_LABEL, sumLines, type Scope,
} from "@/lib/journal-rules";
import { centsStr } from "@/lib/money";
import { timeAgo } from "@/lib/time-ago";
import { useOffice } from "../office-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: JournalData };
const SCOPES: Scope[] = ["all", "cash", "sales", "inventory", "receivables"];
const ACTION_LABEL: Record<string, string> = { insert: "إنشاء القيد", update: "تعديل", delete: "حذف" };

export default function LedgerPage() {
  const { current } = useOffice();
  const canAccess = current.role === "owner" || current.role === "accountant";
  const money = (c: bigint) => formatMoney(centsStr(c), current.currencyLabel);

  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [scope, setScope] = useState<Scope>("all");
  const [simplified, setSimplified] = useState(true);
  const [selectedId, setSelectedId] = useState<string>();
  const [newEntry, setNewEntry] = useState(false);

  useEffect(() => {
    if (!canAccess) return;
    let alive = true;
    loadJournal(current.stationId).then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [current.stationId, canAccess, tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  const data = load.status === "ready" ? load.data : undefined;
  const shown = useMemo(() => {
    if (!data) return [];
    return data.entries.filter((e) => matchesScope(e.lines.map((l) => l.accountCode), scope));
  }, [data, scope]);
  const postedTotals = useMemo(() => data ? sumLines(data.entries.filter((e) => e.status === "posted").flatMap((e) => e.lines)) : undefined, [data]);
  const draftsInPeriod = useMemo(() => {
    if (!data?.period) return 0;
    return data.entries.filter((e) => e.status === "draft" && e.entryDate >= data.period!.startsOn && e.entryDate <= data.period!.endsOn).length;
  }, [data]);

  if (!canAccess) {
    return (
      <div className="mx-auto max-w-2xl">
        <AlertBanner tone="info" title="القيود المحاسبية متاحة لصاحب المحطة والمحاسب فقط">
          هذا القسم يُظهر دفتر الأستاذ وحركة كل حساب، وهي بيانات مالية داخلية.
        </AlertBanner>
      </div>
    );
  }

  const selected = shown.find((e) => e.id === selectedId);
  const closeCheck = data?.period ? canCloseperiod(current.role, draftsInPeriod) : undefined;

  const monthLabel = data?.period
    ? `${new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric" }).format(new Date(data.period.startsOn))} · الفترة ${data.period.status === "open" ? "مفتوحة" : "مغلقة"}`
    : "";

  return (
    <div className="mx-auto flex max-w-[1152px] flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display-32">القيود المحاسبية</h1>
          <p className="text-body-regular-14 text-text-secondary">
            {monthLabel}{data ? ` · آخر تحديث ${formatTime(data.fetchedAt)} · من الخادم` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!canManage(current.role)} title={canManage(current.role) ? undefined : "القيد اليدوي متاح لصاحب المحطة والمحاسب فقط"} onClick={() => setNewEntry(true)}>
            + قيد يدوي
          </Button>
          <Button variant="secondary" disabled title="تصدير القيود إلى ملف غير متاح بعد">تصدير</Button>
          <Button variant="secondary" onClick={refresh}>تحديث</Button>
        </div>
      </header>

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل القيود" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}

      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="نطاق الحسابات" className="flex flex-wrap gap-2">
              {SCOPES.map((s) => (
                <button key={s} type="button" role="tab" aria-selected={scope === s} onClick={() => setScope(s)}
                  className={cx("h-9 rounded-full border px-4 text-body-strong-14",
                    scope === s ? "border-brand-primary bg-brand-primary text-white" : "border-border-default bg-surface-card text-text-secondary")}>
                  {SCOPE_LABEL[s]}
                </button>
              ))}
            </div>
            <div className="flex overflow-hidden rounded-full border border-border-default text-body-strong-14">
              <button type="button" aria-pressed={simplified} onClick={() => setSimplified(true)} className={cx("h-9 px-4", simplified ? "bg-brand-primary text-white" : "bg-surface-card text-text-secondary")}>عرض مبسّط</button>
              <button type="button" aria-pressed={!simplified} onClick={() => setSimplified(false)} className={cx("h-9 px-4", !simplified ? "bg-brand-primary text-white" : "bg-surface-card text-text-secondary")}>عرض المحاسب</button>
            </div>
          </div>

          <section className="overflow-hidden rounded-lg bg-surface-card shadow-card">
            {shown.length === 0 ? (
              <p className="p-8 text-center text-body-regular-14 text-text-secondary">لا توجد قيود في هذا النطاق.</p>
            ) : (
              <table className="w-full text-start text-body-regular-14">
                <thead>
                  <tr className="border-b border-border-default text-body-small-12 text-text-secondary">
                    <th className="p-3 text-start font-normal">القيد</th>
                    <th className="p-3 text-start font-normal">المصدر</th>
                    <th className="p-3 text-start font-normal">البيان</th>
                    <th className="p-3 text-start font-normal">المبلغ</th>
                    {!simplified && <th className="p-3 text-start font-normal">الحساب</th>}
                    <th className="p-3 text-start font-normal">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {shown.map((e) => {
                    const t = sumLines(e.lines);
                    const balanced = isBalanced(t);
                    const badge = entryBadge(e, balanced);
                    const amount = t.debitCents > t.creditCents ? t.debitCents : t.creditCents;
                    return (
                      <tr key={e.id} onClick={() => setSelectedId(e.id)} className="cursor-pointer hover:bg-surface-muted">
                        <td className="whitespace-nowrap p-3">
                          <p className="font-semibold">{e.number ? `JE-${String(e.number).padStart(4, "0")}` : "بلا رقم"}</p>
                          <p className="text-body-small-12 text-text-muted">{timeAgo(e.createdAt)}</p>
                        </td>
                        <td className="whitespace-nowrap p-3 text-text-secondary">{sourceLabel(e.sourceTable)}</td>
                        <td className="p-3">{e.description}</td>
                        <td className="whitespace-nowrap p-3 font-semibold">{money(amount)}</td>
                        {!simplified && (
                          <td className="p-3 text-text-secondary">
                            {e.lines.map((l) => `${l.accountCode} ${l.accountName}`).join(" / ") || "—"}
                          </td>
                        )}
                        <td className="p-3"><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {postedTotals && (
            <footer className="flex flex-col gap-2 rounded-lg bg-surface-card p-4 shadow-card">
              <p className="text-body-strong-14">
                إجمالي المدين = إجمالي الدائن = <span className="text-number-m-18">{money(postedTotals.debitCents)}</span>
              </p>
              {closeCheck && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {!closeCheck.allowed ? (
                    <p className="text-body-small-12 text-status-warning-700">⚠ {closeCheck.reason}</p>
                  ) : (
                    <p className="text-body-small-12 text-text-secondary">كل القيود مرحّلة — يمكن إغلاق الفترة.</p>
                  )}
                  {data.period && (
                    <CloseButton periodId={data.period.id} allowed={closeCheck.allowed} reason={closeCheck.reason} onDone={refresh} />
                  )}
                </div>
              )}
            </footer>
          )}

          <p className="text-body-small-12 text-text-secondary">
            اضغط أي قيد لفتح مصدره وسجله في اللوحة الجانبية. إغلاق الفترة يمنع التعديل إلا بتسوية.
          </p>
        </>
      )}

      {selected && (
        <DetailDrawer key={selected.id} entry={selected} stationId={current.stationId} role={current.role} money={money}
          onClose={() => setSelectedId(undefined)} onChanged={refresh} />
      )}

      {newEntry && (
        <NewEntryModal stationId={current.stationId} accounts={data?.accounts ?? []} onClose={() => setNewEntry(false)}
          onDone={() => { setNewEntry(false); refresh(); }} />
      )}
    </div>
  );

  function CloseButton({ periodId, allowed, reason, onDone }: { periodId: string; allowed: boolean; reason?: string; onDone: () => void }) {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string>();
    return (
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={!allowed || busy} title={allowed ? undefined : reason} onClick={async () => {
          setBusy(true);
          const res: Outcome = await closePeriod(periodId).catch(() => ({ ok: false, message: "لا يوجد اتصال بالخادم" }));
          if (res.ok) return onDone();
          setMsg(res.message);
          setBusy(false);
        }}>{busy ? "جارٍ الإغلاق…" : "إغلاق الفترة"}</Button>
        {msg && <span className="text-body-small-12 text-status-danger-700">{msg}</span>}
      </div>
    );
  }
}

// ---------- detail / audit drawer ----------
function DetailDrawer({ entry, stationId, role, money, onClose, onChanged }: {
  entry: Entry; stationId: string; role: string; money: (c: bigint) => string; onClose: () => void; onChanged: () => void;
}) {
  const [audit, setAudit] = useState<AuditRow[] | undefined>();
  const [reversing, setReversing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  useEffect(() => {
    let alive = true;
    loadAuditTrail(stationId, entry.id).then((rows) => { if (alive) setAudit(rows); }, () => { if (alive) setAudit([]); });
    return () => { alive = false; };
  }, [stationId, entry.id]);

  const totals = sumLines(entry.lines);
  const balanced = isBalanced(totals);
  const canAct = canManage(role);
  const href = entry.sourceTable ? SOURCE_HREF[entry.sourceTable] : undefined;

  async function act(fn: () => Promise<Outcome>) {
    setBusy(true);
    setMsg(undefined);
    const res = await fn().catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    if (res.ok) { onChanged(); return; }
    setMsg(res.message);
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-start bg-black/40" role="dialog" aria-modal="true" aria-label="سجل المراجعة" onClick={onClose}>
      <aside className="flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto bg-surface-card p-6 shadow-raised" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-heading-h2-20">{entry.number ? `JE-${String(entry.number).padStart(4, "0")}` : "بلا رقم"}</h2>
            <p className="text-body-regular-14 text-text-secondary">{entry.description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted">✕</button>
        </div>

        <div className="rounded-md bg-surface-muted p-3">
          <p className="text-body-small-12 text-text-secondary">مصدر القيد</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-body-strong-14">{sourceLabel(entry.sourceTable)}</p>
            {href && <Link href={href} className="text-body-small-12 text-brand-primary underline">فتح المصدر</Link>}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-heading-h3-16">السطور</h3>
          <table className="w-full text-body-regular-14">
            <tbody className="divide-y divide-border-default">
              {entry.lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-2">{l.accountCode} {l.accountName}{l.memo ? <span className="block text-body-small-12 text-text-secondary">{l.memo}</span> : null}</td>
                  <td className="py-2 text-end">{l.debitCents > 0n ? money(l.debitCents) : ""}</td>
                  <td className="py-2 text-end text-text-secondary">{l.creditCents > 0n ? money(l.creditCents) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={cx("mt-2 text-body-small-12", balanced ? "text-status-success-700" : "text-status-danger-700")}>
            {balanced ? "القيد متوازن ✓" : `غير متوازن — مدين ${money(totals.debitCents)} / دائن ${money(totals.creditCents)}`}
          </p>
        </div>

        {entry.reason && (
          <div className="rounded-md bg-surface-muted p-3">
            <p className="text-body-small-12 text-text-secondary">السبب</p>
            <p className="text-body-regular-14">«{entry.reason}»</p>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-heading-h3-16">سجل المراجعة</h3>
          {audit === undefined ? (
            <span className="block h-16 animate-pulse rounded-md bg-surface-muted" />
          ) : audit.length === 0 ? (
            <p className="text-body-small-12 text-text-secondary">{role === "owner" ? "لا حركة مسجّلة بعد." : "سجل المراجعة متاح لصاحب المحطة."}</p>
          ) : (
            <ul className="flex flex-col gap-2 border-s-2 border-border-default ps-3">
              {audit.map((a) => (
                <li key={a.id} className="text-body-small-12">
                  <span className="text-body-strong-14">{ACTION_LABEL[a.action] ?? a.action}</span> — {a.actorName} — {formatTime(a.at)}
                  {a.reason && <span className="block text-text-secondary">«{a.reason}»</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {msg && <AlertBanner tone="danger" title={msg} />}

        {entry.status === "draft" ? (
          <div className="flex flex-col gap-2">
            <Button variant="action" disabled={!canAct || busy || !balanced} title={!canAct ? "متاح لصاحب المحطة والمحاسب فقط" : !balanced ? "أكمل السطور حتى يتوازن القيد أولاً" : undefined}
              onClick={() => act(() => postDraftEntry(entry.id))}>{busy ? "جارٍ الترحيل…" : "ترحيل القيد"}</Button>
            <Button variant="danger" disabled={!canAct || busy} onClick={() => act(() => deleteDraftEntry(entry.id))}>حذف المسودة</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {!reversing ? (
              <Button variant="secondary" disabled={!canAct} title={canAct ? undefined : "عكس القيد متاح لصاحب المحطة والمحاسب فقط"} onClick={() => setReversing(true)}>عكس القيد</Button>
            ) : (
              <div className="flex flex-col gap-2 rounded-md border border-border-default p-3">
                <TextArea label="سبب العكس (يظهر في السجل)" required value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="danger" disabled={busy || reason.trim() === ""} onClick={() => act(() => reverseEntry(entry.id, reason.trim()))}>{busy ? "جارٍ العكس…" : "تأكيد العكس"}</Button>
                  <Button variant="ghost" onClick={() => setReversing(false)}>إلغاء</Button>
                </div>
              </div>
            )}
            <p className="flex items-center gap-2 text-body-small-12 text-text-secondary"><LockIcon /> لا يمكن حذف الحركات المالية. التصحيح يتم بقيد عكسي مع ذكر السبب والصلاحية.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------- new manual entry ----------
type Row = { accountId: string; side: "debit" | "credit"; amount: string };

function NewEntryModal({ stationId, accounts, onClose, onDone }: { stationId: string; accounts: Account[]; onClose: () => void; onDone: () => void }) {
  const [description, setDescription] = useState("");
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([{ accountId: "", side: "debit", amount: "" }, { accountId: "", side: "credit", amount: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const lines = rows.map((r) => ({
    accountId: r.accountId,
    debitCents: r.side === "debit" ? amountCents(r.amount) : 0n,
    creditCents: r.side === "credit" ? amountCents(r.amount) : 0n,
  }));
  const totals = sumLines(lines);
  const complete = rows.every((r) => r.accountId && amountCents(r.amount) > 0n);
  const balanced = complete && totals.debitCents === totals.creditCents && totals.debitCents > 0n;

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!balanced || !description.trim()) return;
    setBusy(true);
    setError(undefined);
    const res = await saveManualEntry({
      stationId, entryDate, description: description.trim(),
      lines: rows.map((r) => ({ accountId: r.accountId, debitCents: r.side === "debit" ? amountCents(r.amount) : 0n, creditCents: r.side === "credit" ? amountCents(r.amount) : 0n, memo: "" })),
    }).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    if (!res.ok) { setError(res.message); setBusy(false); return; }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="قيد يدوي">
      <div className="w-full max-w-lg rounded-lg bg-surface-card p-6 shadow-raised">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-heading-h2-20">قيد يدوي</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted">✕</button>
        </div>
        <div className="flex flex-col gap-4">
          {error && <AlertBanner tone="danger" title={error} />}
          <Input label="البيان" autoComplete="off" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Input label="التاريخ" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />

          <div className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <select value={r.accountId} onChange={(e) => updateRow(i, { accountId: e.target.value })}
                  className="h-10 flex-1 rounded-md border border-border-default bg-surface-card px-2 text-body-regular-14">
                  <option value="">اختر الحساب</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                </select>
                <select value={r.side} onChange={(e) => updateRow(i, { side: e.target.value as Row["side"] })}
                  className="h-10 w-24 rounded-md border border-border-default bg-surface-card px-2 text-body-regular-14">
                  <option value="debit">مدين</option>
                  <option value="credit">دائن</option>
                </select>
                <input value={r.amount} onChange={(e) => updateRow(i, { amount: e.target.value })} inputMode="decimal" placeholder="0"
                  className="h-10 w-28 rounded-md border border-border-default bg-surface-card px-2 text-end text-body-regular-14" />
                <button type="button" disabled={rows.length <= 2} aria-label="حذف السطر" title={rows.length <= 2 ? "أقل عدد سطرين" : undefined}
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted disabled:opacity-40">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setRows((rs) => [...rs, { accountId: "", side: "debit", amount: "" }])}
              className="self-start text-body-small-12 text-brand-primary">+ سطر</button>
          </div>

          <p className={cx("text-body-small-12", balanced ? "text-status-success-700" : "text-text-secondary")}>
            {complete
              ? (balanced ? "القيد متوازن ✓" : `الفرق: ${centsStr(totals.debitCents > totals.creditCents ? totals.debitCents - totals.creditCents : totals.creditCents - totals.debitCents)}`)
              : "أكمل الحساب والمبلغ في كل سطر"}
          </p>

          <div className="flex gap-2">
            <Button variant="action" size="lg" block disabled={!balanced || !description.trim() || busy} onClick={save}>{busy ? "جارٍ الحفظ والترحيل…" : "حفظ وترحيل"}</Button>
            <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function amountCents(v: string): bigint {
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(v.trim());
  if (!m) return 0n;
  return BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0"));
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <span className="h-10 w-72 animate-pulse rounded-md bg-surface-muted" />
      <span className="h-96 animate-pulse rounded-lg bg-surface-muted" />
    </div>
  );
}
