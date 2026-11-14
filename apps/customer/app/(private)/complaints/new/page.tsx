"use client";
// C7 — «شكوى جديدة», now a real route (/complaints/new) instead of a modal, so the browser back button
// returns to the complaints list and the URL can be refreshed/shared. The form body is `NewComplaintModal`
// from the old complaints/page.tsx, unchanged; only the outer chrome (page header instead of a dialog) and
// the post-submit navigation (router.replace to the new complaint's real id) are different.
import { AlertBanner, Button, cx } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { type ComplaintKind } from "@/lib/complaint-rules";
import { fileComplaint, loadStationOptions, type StationOption } from "@/lib/complaints-data";
import { useCustomer } from "../../customer-context";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

export default function NewComplaintPage() {
  const router = useRouter();
  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 p-4 pb-10">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.push("/complaints")} aria-label="رجوع"
          className={cx("inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-muted text-text-primary transition-colors motion-reduce:transition-none hover:bg-border-default", FOCUS)}>
          <Icon name="chevron-left" size={20} className="rtl:rotate-180" />
        </button>
        <h1 className="text-heading-h2-20">شكوى جديدة</h1>
      </div>
      <NewComplaintForm />
    </div>
  );
}

function NewComplaintForm() {
  const { userId } = useCustomer();
  const router = useRouter();
  const [stations, setStations] = useState<StationOption[]>();
  const [stationId, setStationId] = useState("");
  const [kind, setKind] = useState<ComplaintKind>("complaint");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => { loadStationOptions().then((s) => { setStations(s); if (s[0]) setStationId(s[0].id); }); }, []);

  async function send() {
    setBusy(true); setError(undefined);
    const res = await fileComplaint(userId, stationId, kind, subject.trim()).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (!res.ok) return setError(res.message);
    router.replace(`/complaints/${res.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <AlertBanner tone="danger" title={error} />}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="complaint-station" className="text-label-12 text-text-secondary">المحطة</label>
        <select id="complaint-station" value={stationId} onChange={(e) => setStationId(e.target.value)}
          className={cx("h-11 rounded-[10px] border border-border-strong bg-surface-card px-3 text-body-large-16 text-text-primary", FOCUS)}>
          {stations?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div role="group" aria-label="نوع البلاغ" className="flex gap-1 rounded-[12px] bg-surface-muted p-1">
        <button type="button" aria-pressed={kind === "complaint"} onClick={() => setKind("complaint")}
          className={cx("h-11 flex-1 rounded-[10px] text-body-strong-14 transition-colors motion-reduce:transition-none", FOCUS, kind === "complaint" ? "bg-brand-primary text-white" : "text-text-secondary")}>شكوى</button>
        <button type="button" aria-pressed={kind === "price_report"} onClick={() => setKind("price_report")}
          className={cx("h-11 flex-1 rounded-[10px] text-body-strong-14 transition-colors motion-reduce:transition-none", FOCUS, kind === "price_report" ? "bg-brand-primary text-white" : "text-text-secondary")}>بلاغ سعر</button>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="complaint-subject" className="text-label-12 text-text-secondary">صف المشكلة</label>
        <textarea id="complaint-subject" value={subject} onChange={(e) => setSubject(e.target.value)}
          className="h-[148px] resize-none rounded-[12px] border-2 border-border-strong bg-surface-card p-3.5 text-body-large-16 text-text-primary outline-none placeholder:text-text-muted focus:border-brand-primary" />
      </div>
      <Button variant="primary" size="lg" block disabled={busy || !subject.trim() || !stationId} onClick={send}
        className="gap-2">
        <Icon name="send" size={18} />
        {busy ? "جارٍ الإرسال…" : "إرسال"}
      </Button>
    </div>
  );
}
