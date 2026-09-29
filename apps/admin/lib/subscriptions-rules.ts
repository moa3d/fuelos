// A3 «الاشتراكات والباقات» helpers. No imports, so `node --test` runs it directly.

export const FEATURE_LABEL: Record<string, string> = {
  credit_accounts: "حسابات الشركات والسائقين",
  advanced_reports: "التقارير المتقدمة",
  loyalty: "نقاط الولاء وفواتير رقمية للزبون",
  multi_station: "لوحة الفروع المتعددة",
};

/** A plan's features, as a fixed, ordered checklist (every known key, checked only if that plan has it) —
 * shows exactly what's in `plans.features`, nothing assumed as a "baseline" the schema doesn't record. */
export function featureChecklist(planFeatures: string[]): { key: string; label: string; included: boolean }[] {
  return Object.entries(FEATURE_LABEL).map(([key, label]) => ({ key, label, included: planFeatures.includes(key) }));
}
