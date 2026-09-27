"use client";
// Everything behind sign-in (C3 onward): checks the session, then provides CustomerContext.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { customerAccess } from "@/lib/customer-access";
import { supabase } from "@/lib/supabase";
import { CustomerContext } from "./customer-context";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; userId: string; name: string | null };

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    customerAccess().then((a) => {
      if (a.kind === "customer") setState({ status: "ready", userId: a.userId, name: a.name });
      else if (a.kind === "signed-out") router.replace("/login");
      else setState({ status: "error" });
    }, () => setState({ status: "error" }));
    const { data } = supabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  if (state.status === "loading") {
    return <div aria-busy className="mx-auto max-w-[480px] p-4"><span className="block h-40 animate-pulse rounded-lg bg-surface-muted" /></div>;
  }
  if (state.status === "error") {
    return <p className="mx-auto max-w-[480px] p-4 text-center text-body-regular-14 text-text-secondary">تعذّر التحقق من حسابك — أعد فتح الصفحة.</p>;
  }
  return <CustomerContext.Provider value={{ userId: state.userId, name: state.name }}>{children}</CustomerContext.Provider>;
}
