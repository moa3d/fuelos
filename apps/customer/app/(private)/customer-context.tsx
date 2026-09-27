"use client";
// Shared by every screen that needs a signed-in customer (C3 onward). Mirrors apps/owner-web's office-context.
import { createContext, useContext } from "react";

export type CustomerContextValue = { userId: string; name: string | null };

export const CustomerContext = createContext<CustomerContextValue | null>(null);

export function useCustomer(): CustomerContextValue {
  const v = useContext(CustomerContext);
  if (!v) throw new Error("useCustomer must be used inside the (private) layout");
  return v;
}
