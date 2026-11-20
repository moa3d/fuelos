"use client";
import { AlertBanner, Button, Input, TextArea } from "@fuelos/ui";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Offer {
  title: string;
  description: string;
  endsAt: string | null;
}

interface Props {
  stationId: string;
  canManage: boolean;
}

function formatEndsAt(endsAt: string): string {
  return new Date(endsAt).toLocaleDateString("ar-SY", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function PromosTab({ stationId, canManage }: Props) {
  const [offer, setOffer] = useState<Offer | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [endsAt, setEndsAt] = useState("");

  async function fetchOffer() {
    const { data, error } = await supabase().rpc("station_live_row", { p_station: stationId });
    if (error) { setMsg(error.message); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;
    setOffer(d?.offer ?? null);
  }

  useEffect(() => {
    supabase().rpc("station_live_row", { p_station: stationId }).then(({ data, error }) => {
      if (error) { setMsg(error.message); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      setOffer(d?.offer ?? null);
    });
  }, [stationId]);

  async function publishPromo() {
    if (!title.trim() || !description.trim()) { setMsg("العنوان والوصف مطلوبان"); return; }
    setBusy(true); setMsg(undefined);
    const { error } = await supabase().rpc("create_station_promo", {
      p_station: stationId,
      p_title: title.trim(),
      p_description: description.trim(),
      p_ends_at: endsAt || null,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setTitle(""); setDescription(""); setEndsAt("");
    await fetchOffer();
  }

  async function endPromo() {
    setBusy(true); setMsg(undefined);
    // idempotent — no error if already ended, just refresh (Review Focus #5)
    await supabase().rpc("end_station_promo", { p_station: stationId });
    setBusy(false);
    await fetchOffer();
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface-card p-6 shadow-card">
      <h2 className="text-heading-h2-20">العروض والإعلانات</h2>
      <p className="text-body-small-12 text-text-secondary">
        انشر عرضاً لإرسال إشعار فوري لزبائن التطبيق. عرض واحد نشط لكل محطة.
      </p>

      {!canManage && <AlertBanner tone="info" title="التعديل متاح لصاحب المحطة ومدير المناوبة فقط" />}

      {offer === undefined && (
        <span className="block h-24 animate-pulse rounded-lg bg-surface-muted" />
      )}

      {offer !== undefined && offer !== null && (
        <div className="flex flex-col gap-3 rounded-lg border border-border-muted bg-surface-muted p-4">
          <p className="text-heading-h3-16 text-text-primary">{offer.title}</p>
          <p className="text-body-14 text-text-secondary">{offer.description}</p>
          {offer.endsAt && (
            <p className="text-body-small-12 text-text-tertiary">ينتهي في {formatEndsAt(offer.endsAt)}</p>
          )}
          {canManage && (
            <Button variant="danger" disabled={busy} onClick={endPromo}>
              {busy ? "جارٍ الإنهاء…" : "إنهاء العرض"}
            </Button>
          )}
        </div>
      )}

      {offer !== undefined && offer === null && canManage && (
        <div className="flex flex-col gap-3">
          <Input
            label="عنوان العرض"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثال: خصم 10% على البنزين"
          />
          <TextArea
            label="وصف العرض"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="تفاصيل العرض للزبائن"
          />
          <Input
            label="تاريخ انتهاء العرض (اختياري)"
            type="datetime-local"
            dir="ltr"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
          <Button variant="action" disabled={busy} onClick={publishPromo}>
            {busy ? "جارٍ النشر…" : "نشر العرض"}
          </Button>
        </div>
      )}

      {offer !== undefined && offer === null && !canManage && (
        <p className="text-body-small-12 text-text-secondary">لا يوجد عرض نشط حالياً.</p>
      )}

      {msg && <AlertBanner tone="danger" title={msg} />}
    </section>
  );
}
