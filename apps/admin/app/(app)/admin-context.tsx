"use client";
// The signed-in platform staff member, shared by every page behind the login.
import { createContext, useContext } from "react";
import type { PlatformRole } from "@/lib/admin-access";

export type AdminContextValue = { userId: string; role: PlatformRole };

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const v = useContext(AdminContext);
  if (!v) throw new Error("useAdmin must be used inside the (app) layout");
  return v;
}
