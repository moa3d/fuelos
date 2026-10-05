"use client";
// «بطاقتي» (docs/briefs/06d, delivered in 06e; design CU8): the QR an attendant scans (or the code typed by hand when
// there's no scanner) to link a cash sale — lookup_customer_for_sale() on the worker side matches it, or the
// customer's phone, at that station only. Nothing here is secret: it only identifies the customer, like a phone
// number would, and the worker RPC itself returns just a first name back for confirmation.
import { AlertBanner, Button, cx } from "@fuelos/ui";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Icon } from "@/components/Icon";
import { groupedCode, loadMyCard, type MyCard } from "@/lib/card-data";
import { useCustomer } from "../customer-context";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";
// Same values as the brand-dark / surface-card tokens (QR encoders need literal colors).
const QR_COLORS = { dark: "#071E2D", light: "#FFFFFF" };

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
    QRCode.toDataURL(load.data.qrToken, { width: 240, margin: 1, color: QR_COLORS }).then((url) => { if (alive) setQrSrc(url); }).catch(() => {});
    return () => { alive = false; };
  }, [load]);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 p-4 pb-10">
      <h1 className="text-heading-h1-24 text-text-primary">بطاقتي</h1>

      {load.status === "loading" && (
        <div aria-busy className="flex flex-col items-center gap-4 rounded-xl bg-brand-dark p-5">
          <span className="block h-8 w-full motion-safe:animate-pulse rounded-md bg-brand-dark-700" />
          <span className="block size-[212px] motion-safe:animate-pulse rounded-[18px] bg-brand-dark-700" />
          <span className="block h-8 w-48 motion-safe:animate-pulse rounded-full bg-brand-dark-700" />
        </div>
      )}
      {load.status === "error" && <AlertBanner tone="danger" title="تعذّر تحميل البطاقة" />}

      {load.status === "ready" && (
        <>
          <div className="flex flex-col items-center gap-4 rounded-xl bg-brand-dark p-5 text-text-on-dark shadow-raised">
            <div className="flex w-full items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-brand-action">
                <Icon name="fuel" size={18} className="text-brand-dark" />
              </span>
              <span className="text-heading-h3-16 text-text-on-dark">FuelOS</span>
            </div>

            <div className="flex items-center justify-center rounded-[18px] bg-surface-card p-3.5">
              {qrSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, not a next/image asset
                <img src={qrSrc} alt="رمز البطاقة" width={184} height={184} className="size-[184px]" />
              ) : <span className="block size-[184px] motion-safe:animate-pulse rounded-md bg-surface-muted" />}
            </div>

            <div className="flex flex-col items-center gap-1 text-center">
              <p dir="ltr" className="text-number-l-24 tracking-wider text-text-on-dark">{groupedCode(load.data.qrToken)}</p>
              <p className="text-body-regular-14 text-text-on-dark-muted">{name ?? load.data.displayName ?? "زبون FuelOS"}</p>
            </div>
          </div>

          <Button variant="secondary" block className={cx("min-h-11", FOCUS)}
            onClick={() => { navigator.clipboard?.writeText(load.data.qrToken); setCopied(true); }}>
            <Icon name="copy" size={18} />
            {copied ? "تم النسخ ✓" : "نسخ الرمز"}
          </Button>

          <div className="flex items-start gap-3 rounded-lg border border-border-default bg-surface-card p-4 shadow-card">
            <Icon name="info" size={18} className="mt-0.5 shrink-0 text-brand-primary" />
            <p className="text-body-small-12 text-text-secondary">
              أرِ هذا الرمز للعامل عند التعبئة ليربطها بحسابك — فاتورة رقمية ونقاط ولاء، بلا التزام إضافي. يمكنك البيع نقداً دون إظهارها دائماً.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
