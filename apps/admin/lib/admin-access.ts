// Who's signed in as platform staff (RLS: is_platform_staff() — a platform_staff row for auth.uid()). Mirrors
// apps/owner-web/lib/office.ts's shape.
import { supabase } from "./supabase";

export type PlatformRole = "platform_admin" | "support";
export type AdminAccess =
  | { kind: "admin"; userId: string; role: PlatformRole }
  | { kind: "none" }
  | { kind: "signed-out" }
  | { kind: "error" };

export const ROLE_LABEL: Record<PlatformRole, string> = { platform_admin: "أدمن المنصة", support: "دعم" };

export async function adminAccess(): Promise<AdminAccess> {
  const { data: { session } } = await supabase().auth.getSession();
  const userId = session?.user.id;
  if (!userId) return { kind: "signed-out" };
  const { data, error } = await supabase().from("platform_staff").select("role").eq("user_id", userId).maybeSingle();
  if (error) return { kind: "error" };
  return data ? { kind: "admin", userId, role: data.role as PlatformRole } : { kind: "none" };
}
