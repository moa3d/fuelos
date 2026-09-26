// Who may use the office app: active owners, accountants and shift managers of a station (RLS-scoped reads).
// Attendants use the worker app; platform staff get the admin app later.
import { supabase } from "./supabase";

export type OfficeRole = "owner" | "accountant" | "shift_manager";
export type Membership = { stationId: string; stationName: string; role: OfficeRole; displayName: string };

export type OfficeAccess =
  | { kind: "office"; userId: string; memberships: Membership[] }
  | { kind: "attendant-only" }
  | { kind: "none" }
  | { kind: "signed-out" }
  | { kind: "error" };

export const ROLE_LABEL: Record<OfficeRole, string> = {
  owner: "صاحب المحطة",
  accountant: "محاسب",
  shift_manager: "مدير مناوبة",
};

export async function officeAccess(): Promise<OfficeAccess> {
  const { data: { session } } = await supabase().auth.getSession();
  const userId = session?.user.id;
  if (!userId) return { kind: "signed-out" };
  const { data, error } = await supabase()
    .from("station_members")
    .select("station_id, role, status, display_name, stations(name)")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) return { kind: "error" };
  const rows = (data ?? []) as unknown as {
    station_id: string; role: string; display_name: string; stations: { name: string } | null;
  }[];
  const memberships = rows
    .filter((r) => r.role === "owner" || r.role === "accountant" || r.role === "shift_manager")
    .map((r) => ({
      stationId: r.station_id, stationName: r.stations?.name ?? "", role: r.role as OfficeRole, displayName: r.display_name,
    }));
  if (memberships.length > 0) return { kind: "office", userId, memberships };
  return rows.some((r) => r.role === "attendant") ? { kind: "attendant-only" } : { kind: "none" };
}
