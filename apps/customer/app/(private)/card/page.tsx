"use client";
// «بطاقتي» (docs/briefs/06d, delivered in 06e): the QR an attendant scans (or the code typed by hand when
// there's no scanner) to link a cash sale — lookup_customer_for_sale() on the worker side matches it, or the
// customer's phone, at that station only. Nothing here is secret: it only identifies the customer, like a phone
// number would, and the worker RPC itself returns just a first name back for confirmation.
import { AlertBanner, Button } from "@fuelos/ui";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { groupedCode, loadMyCard, type MyCard } from "@/lib/card-data";
import { useCustomer } from "../customer-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: MyCard };

export default function CardPage() {
  const { userId, name } = useCustomer();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [qrSrc, setQrSrc] = useState<string>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    loadMyCard(userId).then((data) => { if (alive) setLoad({ status: "ready", data }); }, () => { if (alive) setLoad({ status: "error" }); });
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    if (load.status !== "ready") return;
    let alive = true;
    QRCode.toDataURL(load.data.qrToken, { width: 240, margin: 1 }).then((url) => { if (alive) setQrSrc(url); }).catch(() => {});
    return () => { alive = false; };
  }, [load]);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 p-4 pb-10">
      <h1 className="text-heading-h1-24">بطاقتي</h1>

      {load.status === "loading" && <span className="block h-96 animate-pulse rounded-lg bg-surface-muted" />}
      {load.status === "error" && <AlertBanner tone="danger" title="تعذّر تحميل البطاقة" />}

      {load.status === "ready" && (
        <div className="flex flex-col items-center gap-4 rounded-lg bg-surface-card p-6 shadow-card">
          <p className="text-body-strong-14">{name ?? load.data.displayName ?? "زبون FuelOS"}</p>
          <div className="flex size-64 items-center justify-center rounded-lg bg-white p-2">
            {qrSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, not a next/image asset
              <img src={qrSrc} alt="رمز البطاقة" className="size-full" />
            ) : <span className="block size-full animate-pulse rounded-md bg-surface-muted" />}
          </div>
          <p dir="ltr" className="font-mono text-heading-h2-20 tracking-wider">{groupedCode(load.data.qrToken)}</p>
          <Button variant="secondary" size="md" onClick={() => { navigator.clipboard?.writeText(load.data.qrToken); setCopied(true); }}>
            {copied ? "تم النسخ ✓" : "نسخ الرمز"}
          </Button>
          <p className="text-center text-body-small-12 text-text-secondary">
            أرِ هذا الرمز للعامل عند التعبئة ليربطها بحسابك — فاتورة رقمية ونقاط ولاء، بلا التزام إضافي. يمكنك البيع نقداً دون إظهارها دائماً.
          </p>
        </div>
      )}
    </div>
  );
}
