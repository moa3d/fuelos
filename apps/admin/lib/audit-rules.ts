// A4 «الصلاحيات والسجلات والدعم» helpers: classifying an audit_log row by the table it touched, and the
// fixed (non-configurable) role reference list. No imports, so `node --test` runs it directly.

export type AuditCategory = "security" | "financial" | "other";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const SECURITY_ENTITIES = new Set(["station_members", "access_grants", "feature_flags", "platform_staff"]);
const FINANCIAL_ENTITIES = new Set([
  "journal_entries", "accounting_periods", "expenses", "fuel_deliveries", "sales", "prices",
  "company_accounts", "approval_requests",
]);

export function auditCategory(entity: string): AuditCategory {
  if (SECURITY_ENTITIES.has(entity)) return "security";
  if (FINANCIAL_ENTITIES.has(entity)) return "financial";
  return "other";
}

/** A short display tag per entity — more specific than the two filter tabs, shown on each row. */
const ENTITY_TAG: Record<string, string> = {
  station_members: "صلاحيات", access_grants: "وصول", feature_flags: "إعداد", platform_staff: "صلاحيات",
  journal_entries: "مالي حساس", accounting_periods: "مالي حساس", expenses: "مالي حساس",
  fuel_deliveries: "مالي حساس", sales: "مالي حساس", prices: "أسعار", company_accounts: "مالي حساس",
  approval_requests: "اعتماد", stations: "إعداد", product_availability: "أسعار", shifts: "مناوبة",
};
export function auditTag(entity: string): string {
  return ENTITY_TAG[entity] ?? entity;
}

export const CATEGORY_LABEL: Record<AuditCategory, string> = { security: "أمني", financial: "مالي حساس", other: "أخرى" };

/** Fixed platform roles for the reference panel — not a configurable matrix (fuelos-permissions skill). */
export type RoleKey = "owner" | "accountant" | "shift_manager" | "attendant" | "support" | "platform_admin";
export const ROLE_TEMPLATE_LABEL: Record<RoleKey, { title: string; description: string }> = {
  owner: { title: "صاحب محطة", description: "كل بيانات محطته وفروعه" },
  accountant: { title: "محاسب", description: "قيود، تقارير، تسويات" },
  shift_manager: { title: "مدير وردية", description: "تسويات صغيرة، فتح مناوبة" },
  attendant: { title: "عامل تعبئة", description: "مناوبته وعملياته فقط" },
  support: { title: "دعم", description: "تذاكر الدعم دون تفاصيل مالية" },
  platform_admin: { title: "أدمن المنصة", description: "كل شيء، مع سجل كامل" },
};
