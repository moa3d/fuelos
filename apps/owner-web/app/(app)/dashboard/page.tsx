"use client";
// Placeholder for O1 «لوحة القيادة» — proves the office login and the role check end to end.
import { formatDay } from "@fuelos/core";
import { AlertBanner } from "@fuelos/ui";
import { useState } from "react";
import { ROLE_LABEL } from "@/lib/office";
import { useOffice } from "../office-context";

export default function DashboardPage() {
  const { current } = useOffice();
  const [today] = useState(() => new Date());
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header>
        <p className="text-body-regular-14 text-text-secondary">{formatDay(today)}</p>
        <h1 className="text-display-32">مرحباً {current.displayName}</h1>
        <p className="text-body-large-16 text-text-secondary">{current.stationName} · {ROLE_LABEL[current.role]}</p>
      </header>
      <AlertBanner tone="info" title="لوحة القيادة (O1) قادمة في الخطوة التالية">
        بعدها: المبيعات والمناوبات (O3)، ثم الموافقات (O7).
      </AlertBanner>
    </div>
  );
}
