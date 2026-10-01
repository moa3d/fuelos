"use client";
// A2 steps 2-3 — تجهيز المعدات وجاهزية أول يوم تشغيل (design/screens/A2.png). docs/briefs/06b/06e: a brand-new
// station has no tanks/pumps/nozzles until setup_station_equipment() runs; station_readiness() is the only
// honest way to show the checklist since the platform cannot select a station's own tables directly (RLS).
import { AlertBanner, Button, cx, Input, StatusBadge } from "@fuelos/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { loadReadiness, setupStationEquipment } from "@/lib/equipment-data";
import {
  buildPayload, draftFromTemplate, readinessCount, readinessItems, TEMPLATES,
  type Draft, type ReadinessData, type TemplateId,
} from "@/lib/equipment-rules";
import { loadStationHeader, type StationHeader } from "@/lib/stations-data";
import { stationBadge } from "@/lib/stations-rules";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; header: StationHeader; readiness: ReadinessData };

export default function StationDetailPage() {
  const params = useParams<{ id: string }>();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([loadStationHeader(params.id), loadReadiness(params.id)]).then(
      ([header, readiness]) => { if (alive && header) setLoad({ status: "ready", header, readiness }); else if (alive) setLoad({ status: "error" }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [params.id, tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  return (
    <div className="mx-auto flex max-w-[800px] flex-col gap-6">
      <Link href="/stations" className="self-start text-body-strong-14 text-brand-primary">‹ المحطات</Link>

      {load.status === "loading" && <span className="block h-96 animate-pulse rounded-lg bg-surface-muted" />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل المحطة" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>} />
      )}

      {load.status === "ready" && (
        <>
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-display-32">{load.header.name}</h1>
              <p className="text-body-regular-14 text-text-secondary">{load.header.city ?? "—"}</p>
            </div>
            <StatusBadge tone={stationBadge(load.header.status).tone}>{stationBadge(load.header.status).label}</StatusBadge>
          </header>

          <ReadinessCard readiness={load.readiness} />

          {load.readiness.tanks > 0 && load.readiness.pumps > 0 ? (
            <section className="rounded-lg bg-surface-card p-6 shadow-card">
              <h2 className="text-heading-h2-20">المعدات</h2>
              <p className="mt-1 text-body-regular-14 text-text-secondary">
                {load.readiness.tanks} خزان · {load.readiness.pumps} مضخة · {load.readiness.nozzles} مسدس — التجهيز الإضافي لاحقاً من إعدادات صاحب المحطة.
              </p>
            </section>
          ) : (
            <EquipmentSetup stationId={params.id} onDone={refresh} />
          )}
        </>
      )}
    </div>
  );
}

function ReadinessCard({ readiness }: { readiness: ReadinessData }) {
  const items = readinessItems(readiness);
  const { done, total } = readinessCount(items);
  return (
    <section className="rounded-lg bg-surface-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-heading-h2-20">جاهزية أول يوم تشغيل</h2>
        <span className="text-number-m-18">{done} / {total}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-brand-action" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <ul className="mt-4 flex flex-col divide-y divide-border-default">
        {items.map((i) => (
          <li key={i.key} className="flex items-center justify-between gap-2 py-2.5 text-body-regular-14">
            <span className={i.done ? undefined : "text-text-secondary"}>{i.label}</span>
            <span aria-hidden className={cx("text-body-strong-14", i.done ? "text-status-success-700" : "text-text-muted")}>{i.done ? "✓" : "—"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- equipment setup (first time only — a station already equipped skips straight to the summary) ----------
function EquipmentSetup({ stationId, onDone }: { stationId: string; onDone: () => void }) {
  const [templateId, setTemplateId] = useState<TemplateId>("small");
  const [draft, setDraft] = useState<Draft>(() => draftFromTemplate("small"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ tanks: number; pumps: number; nozzles: number }>();

  function pickTemplate(id: TemplateId) {
    setTemplateId(id);
    setDraft(draftFromTemplate(id));
  }

  function setReading(pumpIndex: number, nozzleIndex: number, value: string) {
    setDraft((d) => ({
      ...d,
      pumps: d.pumps.map((p, pi) => pi !== pumpIndex ? p : {
        ...p, nozzles: p.nozzles.map((n, ni) => ni !== nozzleIndex ? n : { ...n, lastReading: value }),
      }),
    }));
  }

  const payload = buildPayload(draft);

  async function save() {
    if (!payload || busy) return;
    setBusy(true); setError(undefined);
    const res = await setupStationEquipment(stationId, payload).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setDone({ tanks: res.tanks, pumps: res.pumps, nozzles: res.nozzles });
  }

  if (done) {
    return (
      <AlertBanner tone="success" title={`جُهّزت المحطة: ${done.tanks} خزان، ${done.pumps} مضخة، ${done.nozzles} مسدس`}
        action={<Button variant="secondary" onClick={onDone}>تحديث الجاهزية</Button>} />
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface-card p-6 shadow-card">
      <div>
        <h2 className="text-heading-h2-20">تجهيز المعدات</h2>
        <p className="text-body-regular-14 text-text-secondary">اختر قالباً ثم صحّح القراءات لتطابق ما تظهره عدادات المضخات فعلياً.</p>
      </div>

      <div role="radiogroup" aria-label="القالب" className="flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={templateId === t.id} onClick={() => pickTemplate(t.id)}
            className={cx("h-10 rounded-full border px-4 text-body-strong-14",
              templateId === t.id ? "border-brand-primary bg-brand-primary text-white" : "border-border-default bg-surface-card text-text-secondary")}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <AlertBanner tone="danger" title={error} />}

      <div className="flex flex-col gap-3">
        {draft.pumps.map((p, pi) => (
          <div key={p.number} className="rounded-md border border-border-default p-3">
            <p className="mb-2 text-body-strong-14">مضخة {p.number}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {p.nozzles.map((n, ni) => (
                <Input key={n.label} size="md" label={`مسدس ${n.label} · ${n.productName}`} inputMode="decimal" autoComplete="off" suffix="لتر"
                  value={n.lastReading} onChange={(e) => setReading(pi, ni, e.target.value)}
                  helper="اكتب الرقم الظاهر على العداد الآن" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <Button variant="action" size="lg" disabled={!payload || busy} onClick={save}>
        {busy ? "جارٍ التجهيز…" : "تجهيز المعدات"}
      </Button>
    </section>
  );
}
