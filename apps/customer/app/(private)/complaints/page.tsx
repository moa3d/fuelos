"use client";
// C7 «شكاواي» — split out from the combined رewards/complaints screen now that the bottom nav gives it its own
// tab. Logic and queries are unchanged (lib/complaints-data.ts, lib/complaint-rules.ts). The detail view and
// the "new complaint" form are real routes now (complaints/[id], complaints/new) instead of in-page
// state/modal — see those files for `ComplaintDetail`/`NewComplaintModal`, moved there verbatim.
import { formatDay } from "@fuelos/core";
import { AlertBanner, cx, StatusBadge } from "@fuelos/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { complaintBadge, KIND_LABEL } from "@/lib/complaint-rules";
import { loadComplaints, type ComplaintsData } from "@/lib/complaints-data";
import { useCustomer } from "../customer-context";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

export default function ComplaintsPage() {
  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 p-4 pb-10">
      <h1 className="text-heading-h1-24">الشكاوى</h1>
      <ComplaintsTab />
    </div>
  );
}

type CLoad = { status: "loading" } | { status: "error" } | { status: "ready"; data: ComplaintsData };

function ComplaintsTab() {
  const { userId } = useCustomer();
  const [load, setLoad] = useState<CLoad>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    loadComplaints(userId).then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [userId]);

  return (
    <>
      {load.status === "loading" && (
        <div aria-busy className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => <span key={i} className="block h-[120px] motion-safe:animate-pulse rounded-[18px] bg-surface-muted" />)}
        </div>
      )}
      {load.status === "error" && <AlertBanner tone="danger" title="تعذّر التحميل" />}
      {load.status === "ready" && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-heading-h3-16">{load.data.complaints.length} {load.data.complaints.length === 1 ? "شكوى" : "شكاوى"}</h2>
            <Link href="/complaints/new"
              className={cx("inline-flex h-11 items-center gap-2 rounded-sm bg-brand-primary px-4 text-body-strong-14 text-white transition-colors motion-reduce:transition-none hover:bg-brand-primary-hover", FOCUS)}>
              <Icon name="plus" size={16} />
              شكوى جديدة
            </Link>
          </div>
          {load.data.complaints.length === 0 ? (
            <p className="rounded-[18px] border border-dashed border-border-default bg-surface-card p-6 text-center text-body-regular-14 text-text-secondary shadow-card">لا توجد شكاوى — كل شيء على ما يرام.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {load.data.complaints.map((c) => {
                const badge = complaintBadge(c.status);
                return (
                  <li key={c.id}>
                    <Link href={`/complaints/${c.id}`}
                      className={cx("flex w-full flex-col gap-2 rounded-[18px] border border-border-default bg-surface-card p-4 text-start shadow-card transition-colors motion-reduce:transition-none hover:bg-surface-muted", FOCUS)}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-body-strong-14">{c.stationName}</p>
                        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={c.kind === "price_report" ? "warning" : "primary"}>{KIND_LABEL[c.kind]}</StatusBadge>
                        {c.invoiceNumber && <span className="text-body-small-12 text-text-secondary">فاتورة INV-{c.invoiceNumber}</span>}
                      </div>
                      <p className="line-clamp-2 text-body-regular-14 text-text-secondary">
                        {c.lastMessage ? `${c.lastMessage.authorSide === "customer" ? "أنت: " : "المحطة: "}${c.lastMessage.body}` : c.subject}
                      </p>
                      <p className="text-body-small-12 text-text-secondary">{formatDay(c.lastMessage ? c.lastMessage.createdAt : c.createdAt)}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
