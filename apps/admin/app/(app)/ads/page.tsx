"use client";
// «الإعلانات» (docs/briefs/10a; spec §4): list + create/edit + pause/reorder/archive, and a stats sub-tab.
// Every write goes through save_ad / archive_ad (platform admin only); support sees the same screen read-only,
// per fuelos-permissions' "don't hide, explain" — write controls stay visible but disabled, with a reason.
import { formatDay, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, Input, StatusBadge } from "@fuelos/ui";
import { useEffect, useMemo, useState } from "react";
import {
  adImageUrl, archiveAd, deleteAdImage, loadAds, loadAdStats, saveAd, uploadAdImage,
  type AdminAd, type AdStats, type SaveAdInput,
} from "@/lib/ads-data";
import { exportAdsStatsToExcel } from "@/lib/ads-export";
import {
  adImagePath, ctrPercent, endOfDayLocal, MAX_IMAGE_BYTES, reorderChanges, sortStatTotals, startOfDayLocal, statusBadge,
  toDateInputValue, validateImageFile, validateLink, whatsappLink,
  type StatSortKey, type SortDir as AdSortDir,
} from "@/lib/ads-rules";
import { useAdmin } from "../admin-context";

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };
type Tab = "list" | "stats";

export default function AdsPage() {
  const { role } = useAdmin();
  const canWrite = role === "platform_admin";
  const [tab, setTab] = useState<Tab>("list");

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <header>
        <h1 className="text-display-32">الإعلانات</h1>
        <p className="text-body-regular-14 text-text-secondary">إعلانات الرعاة الظاهرة في تطبيق الزبون — بانر الرئيسية وصفحة «الإعلانات»</p>
        {!canWrite && (
          <p className="mt-1 text-body-small-12 text-status-warning-700">الإضافة والتعديل والإجراءات متاحة لأدمن المنصة فقط — أنت تتصفح للقراءة.</p>
        )}
      </header>

      <div role="tablist" aria-label="الأقسام" className="flex gap-2 border-b border-border-default">
        {([["list", "الإعلانات"], ["stats", "إحصائيات الإعلانات"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cx("-mb-px border-b-2 px-3 py-2 text-body-strong-14",
              tab === k ? "border-brand-primary text-brand-primary" : "border-transparent text-text-secondary hover:text-text-primary")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "list" ? <AdsList canWrite={canWrite} /> : <AdsStats />}
    </div>
  );
}

// ---------------------------------------------------------------- list ----

function AdsList({ canWrite }: { canWrite: boolean }) {
  const [load, setLoad] = useState<Load<AdminAd[]>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<AdminAd | "new" | null>(null);
  const [archiving, setArchiving] = useState<AdminAd | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>();

  // the "loading" reset happens in refresh() itself (called from event handlers), not synchronously here —
  // this effect only subscribes to `tick` and reports the promise's own outcome (same pattern as sales/page.tsx).
  useEffect(() => {
    let alive = true;
    loadAds().then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      (e) => { if (alive) setLoad({ status: "error", message: e instanceof Error ? e.message : "تعذّر تحميل الإعلانات" }); },
    );
    return () => { alive = false; };
  }, [tick]);

  function refresh() { setLoad({ status: "loading" }); setTick((t) => t + 1); }

  function patch(ad: AdminAd, over: Partial<Pick<SaveAdInput, "sortOrder" | "isPaused">>): SaveAdInput {
    return {
      id: ad.id, sponsorName: ad.sponsorName, title: ad.title, imagePath: ad.imagePath, link: ad.linkUrl ?? "",
      startsAt: null, endsAt: ad.endsAt, sortOrder: over.sortOrder ?? null, isPaused: over.isPaused ?? null,
    };
  }

  async function togglePause(ad: AdminAd) {
    setBusyId(ad.id); setActionError(undefined);
    try {
      await saveAd(patch(ad, { isPaused: !ad.isPaused }));
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally {
      setBusyId(null);
    }
  }

  async function move(ad: AdminAd, dir: "up" | "down") {
    if (load.status !== "ready") return;
    const list = load.data;
    const changes = reorderChanges(list.map((a) => ({ id: a.id, sortOrder: a.sortOrder })), list.indexOf(ad), dir);
    if (changes.length === 0) return;
    setBusyId(ad.id); setActionError(undefined);
    try {
      for (const c of changes) {
        const target = list.find((a) => a.id === c.id);
        if (target) await saveAd(patch(target, { sortOrder: c.sortOrder }));
      }
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "تعذّر تغيير الترتيب");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmArchive(ad: AdminAd, removeImage: boolean) {
    setBusyId(ad.id); setActionError(undefined);
    try {
      await archiveAd(ad.id);
      if (removeImage) await deleteAdImage(ad.imagePath).catch(() => undefined); // best-effort; the ad is archived either way
      setArchiving(null);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "تعذّر الأرشفة");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span />
        <Button variant="action" disabled={!canWrite} onClick={() => setEditing("new")}>+ إعلان جديد</Button>
      </div>

      {actionError && <AlertBanner tone="danger" title={actionError} />}

      {load.status === "loading" && <ListSkeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title={load.message} action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>} />
      )}
      {load.status === "ready" && load.data.length === 0 && (
        <div className="rounded-lg bg-surface-card p-10 text-center shadow-card">
          <p className="text-body-regular-14 text-text-secondary">لا توجد إعلانات بعد.</p>
          {canWrite && <Button variant="action" className="mt-4" onClick={() => setEditing("new")}>أضف أول إعلان</Button>}
        </div>
      )}
      {load.status === "ready" && load.data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {load.data.map((ad, i) => (
            <AdRow key={ad.id} ad={ad} canWrite={canWrite} busy={busyId === ad.id}
              isFirst={i === 0} isLast={i === load.data.length - 1}
              onEdit={() => setEditing(ad)} onTogglePause={() => togglePause(ad)}
              onMoveUp={() => move(ad, "up")} onMoveDown={() => move(ad, "down")}
              onArchive={() => setArchiving(ad)} />
          ))}
        </ul>
      )}

      {editing && (
        <AdFormModal ad={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }} />
      )}
      {archiving && (
        <ArchiveConfirmModal ad={archiving} busy={busyId === archiving.id}
          onClose={() => setArchiving(null)} onConfirm={(removeImage) => confirmArchive(archiving, removeImage)} />
      )}
    </div>
  );
}

function AdRow({ ad, canWrite, busy, isFirst, isLast, onEdit, onTogglePause, onMoveUp, onMoveDown, onArchive }: {
  ad: AdminAd; canWrite: boolean; busy: boolean; isFirst: boolean; isLast: boolean;
  onEdit: () => void; onTogglePause: () => void; onMoveUp: () => void; onMoveDown: () => void; onArchive: () => void;
}) {
  const badge = statusBadge(ad.status);
  const reason = canWrite ? undefined : "متاح لأدمن المنصة فقط";
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-lg bg-surface-card p-4 shadow-card">
      {/* eslint-disable-next-line @next/next/no-img-element -- remote Supabase Storage URL, not a local/optimizable asset */}
      <img src={adImageUrl(ad.imagePath)} alt={ad.title} className="h-[54px] w-24 shrink-0 rounded-md object-cover" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-body-strong-14">{ad.sponsorName}</p>
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        </div>
        <p className="truncate text-body-regular-14 text-text-secondary">{ad.title}</p>
        <p className="text-body-small-12 text-text-muted" dir="ltr">
          {formatDay(ad.startsAt)} → {ad.endsAt ? formatDay(ad.endsAt) : "مفتوح"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-body-small-12 text-text-secondary">
        <span>{formatNumber(ad.views, 0)} مشاهدة</span>
        <span>{formatNumber(ad.clicks, 0)} نقرة</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <IconButton title={reason ?? "الأعلى"} disabled={!canWrite || isFirst || busy} onClick={onMoveUp}>▲</IconButton>
        <IconButton title={reason ?? "الأسفل"} disabled={!canWrite || isLast || busy} onClick={onMoveDown}>▼</IconButton>
        <Button variant="secondary" disabled={!canWrite || busy} title={reason} onClick={onEdit}>تعديل</Button>
        <Button variant="secondary" disabled={!canWrite || busy} title={reason} onClick={onTogglePause}>
          {ad.isPaused ? "تشغيل" : "إيقاف"}
        </Button>
        <Button variant="danger" disabled={!canWrite || busy} title={reason} onClick={onArchive}>أرشفة</Button>
      </div>
      {!canWrite && <p className="sr-only">{reason}</p>}
    </li>
  );
}

function IconButton({ children, title, disabled, onClick }: { children: React.ReactNode; title: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick}
      className="flex size-8 items-center justify-center rounded-md border border-border-default text-body-small-12 text-text-secondary disabled:opacity-40 enabled:hover:bg-surface-muted">
      {children}
    </button>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => <span key={i} className="h-20 animate-pulse rounded-lg bg-surface-muted" />)}
    </div>
  );
}

// ------------------------------------------------------------ add/edit ----

function AdFormModal({ ad, onClose, onSaved }: { ad: AdminAd | null; onClose: () => void; onSaved: () => void }) {
  const [sponsorName, setSponsorName] = useState(ad?.sponsorName ?? "");
  const [title, setTitle] = useState(ad?.title ?? "");
  const [link, setLink] = useState(ad?.linkUrl ?? "");
  const [startDate, setStartDate] = useState(ad ? toDateInputValue(ad.startsAt) : "");
  const [endDate, setEndDate] = useState(ad?.endsAt ? toDateInputValue(ad.endsAt) : "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(ad ? adImageUrl(ad.imagePath) : null);
  const [fileError, setFileError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  function onFileChange(f: File | null) {
    setFile(f);
    setFileError(undefined);
    if (!f) { setPreview(ad ? adImageUrl(ad.imagePath) : null); return; }
    const msg = validateImageFile(f);
    if (msg) { setFileError(msg); setPreview(null); return; }
    setPreview(URL.createObjectURL(f));
  }

  const linkError = link.trim() ? validateLink(link) : undefined;
  const dateError = startDate && endDate && endDate < startDate ? "تاريخ النهاية يجب أن يكون بعد تاريخ البداية" : undefined;
  const canSubmit = sponsorName.trim() && title.trim() && (ad || file) && !fileError && !linkError && !dateError && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true); setError(undefined);
    try {
      let imagePath = ad?.imagePath ?? "";
      if (file) {
        const uuid = crypto.randomUUID();
        const path = adImagePath(uuid, file.type);
        const uploaded = await uploadAdImage(path, file);
        if (!uploaded.ok) { setError(uploaded.message); setBusy(false); return; }
        imagePath = uploaded.path;
      }
      // unchanged date fields keep the exact stored timestamp (startsAt: null = "keep") rather than being
      // renormalised to local midnight; endsAt has no such keep-semantics server-side, so it's always resolved.
      const startsAt = ad && startDate === toDateInputValue(ad.startsAt) ? null : (startDate ? startOfDayLocal(startDate) : null);
      const endsAt = endDate ? endOfDayLocal(endDate) : null;
      await saveAd({
        id: ad?.id ?? null, sponsorName: sponsorName.trim(), title: title.trim(), imagePath, link,
        startsAt, endsAt, sortOrder: null, isPaused: null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر حفظ الإعلان");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={ad ? "تعديل إعلان" : "إعلان جديد"}>
      <div className="w-full max-w-lg rounded-lg bg-surface-card p-6 shadow-raised">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-heading-h2-20">{ad ? "تعديل الإعلان" : "إعلان جديد"}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted">✕</button>
        </div>
        <div className="flex flex-col gap-4">
          {error && <AlertBanner tone="danger" title={error} />}

          <div className="flex flex-col gap-2">
            <label className="text-label-12 text-text-secondary">صورة الإعلان (JPG / PNG / WEBP / GIF، حتى 3 ميغابايت)</label>
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL or remote Supabase Storage URL
              <img src={preview} alt="معاينة" className="aspect-video w-full rounded-md border border-border-default object-cover" />
            )}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              className="text-body-regular-14" />
            {fileError && <p className="text-body-small-12 text-status-danger-700">{fileError}</p>}
            <p className="text-body-small-12 text-text-muted">المقاس المقترح 1200×675 (16:9). الحد الأقصى {Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} ميغابايت.</p>
          </div>

          <Input label="اسم الراعي" required value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} maxLength={120} />
          <Input label="العنوان" required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />

          <div className="flex flex-col gap-1">
            <Input label="الرابط (اختياري)" dir="ltr" placeholder="https://... أو tel:+963..." value={link} onChange={(e) => setLink(e.target.value)} />
            {linkError && <p className="text-body-small-12 text-status-danger-700">{linkError}</p>}
            <p className="text-body-small-12 text-text-muted" dir="ltr">
              واتساب: {whatsappLink("963911111111")} · هاتف: tel:+963911111111
            </p>
          </div>

          <div className="flex items-end gap-2">
            <Input label="تاريخ البداية (افتراضي: الآن)" type="date" dir="ltr" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="تاريخ النهاية (اختياري)" type="date" dir="ltr" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          {dateError && <p className="text-body-small-12 text-status-danger-700">{dateError}</p>}

          <Button variant="action" size="lg" block disabled={!canSubmit} onClick={submit}>
            {busy ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ArchiveConfirmModal({ ad, busy, onClose, onConfirm }: { ad: AdminAd; busy: boolean; onClose: () => void; onConfirm: (removeImage: boolean) => void }) {
  const [removeImage, setRemoveImage] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="تأكيد الأرشفة">
      <div className="w-full max-w-sm rounded-lg bg-surface-card p-6 shadow-raised">
        <h2 className="text-heading-h2-20">أرشفة «{ad.title}»؟</h2>
        <p className="mt-2 text-body-regular-14 text-text-secondary">
          لن يظهر الإعلان بعد الآن في تطبيق الزبون. يبقى سجله في الإحصائيات.
        </p>
        <label className="mt-3 flex items-center gap-2 text-body-regular-14">
          <input type="checkbox" checked={removeImage} onChange={(e) => setRemoveImage(e.target.checked)} />
          حذف ملف الصورة أيضاً
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>إلغاء</Button>
          <Button variant="action" disabled={busy} onClick={() => onConfirm(removeImage)}>{busy ? "جارٍ الأرشفة…" : "أرشفة"}</Button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- stats ----

function AdsStats() {
  const [now] = useState(() => new Date());
  const [from, setFrom] = useState(toISODate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toISODate(now));
  const [load, setLoad] = useState<Load<AdStats & { fetchedAt: string }>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [sort, setSort] = useState<{ key: StatSortKey; dir: AdSortDir }>({ key: "views", dir: "desc" });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();

  // runs on mount (tick=0) and again whenever "تطبيق" bumps tick; from/to are read from the latest render's
  // closure, not listed as deps, so editing the date inputs alone doesn't refetch until the button is pressed.
  useEffect(() => {
    let alive = true;
    loadAdStats(from, to).then(
      (data) => { if (alive) setLoad({ status: "ready", data: { ...data, fetchedAt: new Date().toISOString() } }); },
      (e) => { if (alive) setLoad({ status: "error", message: e instanceof Error ? e.message : "تعذّر تحميل الإحصائيات" }); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  function run() { setLoad({ status: "loading" }); setTick((t) => t + 1); }

  const totals = useMemo(() => (load.status === "ready" ? load.data.totals : []), [load]);
  const shown = useMemo(() => sortStatTotals(totals, sort.key, sort.dir), [totals, sort]);
  const grand = useMemo(() => {
    const views = totals.reduce((s, t) => s + t.views, 0);
    const clicks = totals.reduce((s, t) => s + t.clicks, 0);
    return { views, clicks, ctr: ctrPercent(views, clicks) };
  }, [totals]);

  function onSort(key: StatSortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }

  async function onExport() {
    if (load.status !== "ready" || exporting) return;
    setExporting(true); setExportError(undefined);
    try {
      await exportAdsStatsToExcel(shown, { from, to });
    } catch {
      setExportError("تعذّر إنشاء ملف Excel — حاول مرة أخرى");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-end gap-3 rounded-lg bg-surface-card p-4 shadow-card">
        <Input label="من" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="إلى" type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button variant="secondary" onClick={run}>تطبيق</Button>
        <span className="flex-1" />
        <Button variant="action" disabled={load.status !== "ready" || totals.length === 0 || exporting} title={totals.length === 0 ? "لا توجد أرقام في هذه الفترة لتصديرها" : undefined} onClick={onExport}>
          {exporting ? "جارٍ التصدير…" : "تصدير Excel"}
        </Button>
      </section>

      <p className="text-body-small-12 text-text-muted">الأرقام تقديرية (جهاز واحد = مشاهدة أو نقرة واحدة في اليوم)، وليست مدقَّقة محاسبياً.</p>

      {exportError && <AlertBanner tone="danger" title={exportError} />}

      {load.status === "loading" && <ListSkeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title={load.message} action={<Button variant="secondary" onClick={run}>إعادة المحاولة</Button>} />
      )}
      {load.status === "ready" && shown.length === 0 && (
        <p className="rounded-lg bg-surface-card p-8 text-center text-body-regular-14 text-text-secondary">لا توجد مشاهدات أو نقرات في هذه الفترة.</p>
      )}
      {load.status === "ready" && shown.length > 0 && (
        <div className="overflow-x-auto rounded-lg bg-surface-card shadow-card">
          <table className="w-full text-body-regular-14">
            <thead>
              <tr className="border-b border-border-default bg-surface-muted">
                <StatsTh label="الراعي" k="sponsorName" sort={sort} onSort={onSort} />
                <StatsTh label="العنوان" k="title" sort={sort} onSort={onSort} />
                <StatsTh label="المشاهدات" k="views" sort={sort} onSort={onSort} />
                <StatsTh label="النقرات" k="clicks" sort={sort} onSort={onSort} />
                <StatsTh label="نسبة النقر %" k="ctr" sort={sort} onSort={onSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {shown.map((t) => (
                <tr key={t.adId}>
                  <td className="p-3 text-body-strong-14">{t.sponsorName}</td>
                  <td className="p-3 text-text-secondary">{t.title}</td>
                  <td className="p-3">{formatNumber(t.views, 0)}</td>
                  <td className="p-3">{formatNumber(t.clicks, 0)}</td>
                  <td className="p-3">{formatNumber(t.ctr, 1)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border-strong bg-surface-muted font-semibold">
                <td className="p-3">الإجمالي</td>
                <td className="p-3" />
                <td className="p-3">{formatNumber(grand.views, 0)}</td>
                <td className="p-3">{formatNumber(grand.clicks, 0)}</td>
                <td className="p-3">{formatNumber(grand.ctr, 1)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {load.status === "ready" && <p className="text-body-small-12 text-text-muted">آخر تحديث {formatTime(load.data.fetchedAt)} · من الخادم</p>}
    </div>
  );
}

function StatsTh({ label, k, sort, onSort }: { label: string; k: StatSortKey; sort: { key: StatSortKey; dir: AdSortDir }; onSort: (k: StatSortKey) => void }) {
  const active = sort.key === k;
  return (
    <th className="whitespace-nowrap p-3 text-start font-normal">
      <button type="button" onClick={() => onSort(k)}
        className={cx("flex items-center gap-1 text-body-small-12", active ? "text-brand-primary" : "text-text-secondary hover:text-text-primary")}>
        {label}
        {active && <span aria-hidden>{sort.dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
