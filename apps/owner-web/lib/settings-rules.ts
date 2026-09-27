// O11 helpers: member status/role labels and a read-only summary of what each role can already do — the
// permission matrix is fixed in RLS/RPCs (fuelos-permissions skill), not a configurable, per-station setting, so
// this screen documents it rather than pretending it's editable. No imports, so `node --test` runs it directly.

export type MemberRole = "owner" | "accountant" | "shift_manager" | "attendant";
export type MemberStatus = "active" | "invited" | "suspended";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "صاحب المحطة", accountant: "محاسبة", shift_manager: "مدير وردية", attendant: "عامل تعبئة",
};

export function statusBadge(status: MemberStatus): { tone: Tone; label: string } {
  switch (status) {
    case "active": return { tone: "success", label: "نشط" };
    case "invited": return { tone: "warning", label: "دعوة معلّقة" };
    case "suspended": return { tone: "danger", label: "موقوف" };
  }
}

/** Case-insensitive substring match for the user search box, Arabic and Latin text alike. */
export function matchesSearch(name: string, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  return q === "" || name.toLocaleLowerCase().includes(q);
}

/** Changing your own role or status from this screen is refused client-side — never lock yourself out. */
export function isSelfRow(rowUserId: string, currentUserId: string): boolean {
  return rowUserId === currentUserId;
}

/** set_member_pin() only accepts these two roles (attendant or shift_manager). */
export function canSetPin(role: MemberRole): boolean {
  return role === "attendant" || role === "shift_manager";
}

export type Capability = { label: string; roles: MemberRole[] };

/** What's actually enforced today (RLS/RPCs across the schema) — a reference list, not a live setting. */
export const CAPABILITIES: Capability[] = [
  { label: "بدء وإغلاق مناوبة، تسجيل تعبئة", roles: ["attendant", "shift_manager", "owner"] },
  { label: "بيع آجل للشركات حتى الحد المتبقي", roles: ["attendant", "shift_manager", "owner"] },
  { label: "العمل دون اتصال (حتى 50 عملية غير متزامنة)", roles: ["attendant", "shift_manager", "owner"] },
  { label: "اعتماد إغلاق المناوبات وتسويات المخزون", roles: ["shift_manager", "owner"] },
  { label: "الرد على شكاوى الزبائن", roles: ["shift_manager", "owner"] },
  { label: "تعديل سعر اللتر والقيود المحاسبية", roles: ["owner"] },
  { label: "المصاريف والموردون وتقارير الربح والتكاليف", roles: ["accountant", "owner"] },
  { label: "إدارة المستخدمين وحدود التسامح", roles: ["owner"] },
];
