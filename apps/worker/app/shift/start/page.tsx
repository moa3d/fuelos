"use client";
// Placeholder for S1 «بداية المناوبة»: proves the PIN session works (reads the name through RLS).
import { Button, SyncIndicator } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { signOutLocally, supabase } from "@/lib/supabase";
import { useOnline } from "@/lib/use-online";

export default function ShiftStartPage() {
  const router = useRouter();
  const online = useOnline();
  const [name, setName] = useState<string>();

  useEffect(() => {
    (async () => {
      const { data } = await supabase().auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return router.replace("/");
      const cached = await db.member.get("current").catch(() => undefined);
      if (cached?.userId === userId && cached.displayName) setName(cached.displayName);
      if (!cached?.stationId) return;
      // Fresh copy from the server when online (RLS: members read their own station).
      const { data: row } = await supabase()
        .from("station_members").select("display_name")
        .eq("station_id", cached.stationId).eq("user_id", userId).maybeSingle();
      if (row?.display_name) setName(row.display_name);
    })();
  }, [router]);

  async function switchWorker() {
    await signOutLocally();
    await db.member.delete("current").catch(() => undefined);
    router.replace("/");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col px-6 pb-6 pt-[calc(env(safe-area-inset-top)+24px)]">
      <header className="flex items-center justify-between">
        <span className="text-heading-h3-16 text-brand-primary">FuelOS</span>
        <SyncIndicator state={online ? "online" : "offline"} />
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        {name ? (
          <h1 className="text-display-32">مرحباً {name}</h1>
        ) : (
          <span aria-busy className="h-10 w-48 animate-pulse rounded-sm bg-surface-muted" />
        )}
        <p className="text-body-regular-14 text-text-secondary">شاشة بدء المناوبة قادمة في الخطوة التالية.</p>
      </section>

      <Button variant="secondary" size="lg" block onClick={switchWorker}>تبديل العامل</Button>
    </main>
  );
}
