"use client";
// The signed-in office user and the station they are working on, shared by every page behind the login.
import { createContext, useContext } from "react";
import type { Membership } from "@/lib/office";

export type OfficeContextValue = {
  userId: string;
  memberships: Membership[];
  current: Membership;
  switchStation: (stationId: string) => void;
  signOut: () => Promise<void>;
};

export const OfficeContext = createContext<OfficeContextValue | null>(null);

export function useOffice(): OfficeContextValue {
  const v = useContext(OfficeContext);
  if (!v) throw new Error("useOffice must be used inside the (app) layout");
  return v;
}
