// A2's equipment step (design/screens/A2.png): the 3 canonical templates pre-fill a draft the admin can still
// edit (meter readings especially — a template never knows what a real meter shows). No imports, so
// `node --test` runs it directly. admin_create_station() already creates the 3 default products
// (gasoline_90, gasoline_95, diesel) and setup_station_equipment() only needs their codes via tank.product_code
// — no new `products` entries unless the station sells something outside the 3 defaults.

export type TemplateId = "small" | "medium" | "large";
export const TEMPLATES: { id: TemplateId; label: string; pumps: number }[] = [
  { id: "small", label: "صغيرة · 4 مضخات", pumps: 4 },
  { id: "medium", label: "متوسطة · 6 مضخات", pumps: 6 },
  { id: "large", label: "كبيرة · 10 مضخات", pumps: 10 },
];

const PRODUCTS: { code: string; name: string }[] = [
  { code: "gasoline_95", name: "بنزين 95" },
  { code: "gasoline_90", name: "بنزين 90" },
  { code: "diesel", name: "مازوت" },
];

export type DraftTank = { key: string; productCode: string; productName: string; capacityL: string; minLevelPct: string };
export type DraftNozzle = { label: string; productCode: string; productName: string; lastReading: string };
export type DraftPump = { number: number; nozzles: DraftNozzle[] };
export type Draft = { tanks: DraftTank[]; pumps: DraftPump[] };

/** One tank per default product, two nozzles per pump cycling through them. All numbers are editable after. */
export function draftFromTemplate(id: TemplateId): Draft {
  const pumpCount = TEMPLATES.find((t) => t.id === id)!.pumps;
  const tanks: DraftTank[] = PRODUCTS.map((p) => ({ key: p.code, productCode: p.code, productName: p.name, capacityL: "20000", minLevelPct: "20" }));
  const pumps: DraftPump[] = Array.from({ length: pumpCount }, (_, i) => {
    const a = PRODUCTS[i % PRODUCTS.length];
    const b = PRODUCTS[(i + 1) % PRODUCTS.length];
    return {
      number: i + 1,
      nozzles: [
        { label: "1", productCode: a.code, productName: a.name, lastReading: "0" },
        { label: "2", productCode: b.code, productName: b.name, lastReading: "0" },
      ],
    };
  });
  return { tanks, pumps };
}

export type EquipmentPayload = {
  tanks: { key: string; product_code: string; name: string; capacity_l: number; min_level_pct: number }[];
  pumps: { number: number; name: string | null; nozzles: { label: string; tank_key: string; last_reading: number }[] }[];
};

const INT_RE = /^\d+$/;
const READING_RE = /^\d+(\.\d{1,1})?$/;

/** null means the draft has a bad number somewhere — the caller shows a generic "تحقّق من الأرقام" hint. */
export function buildPayload(draft: Draft): EquipmentPayload | null {
  const tanks: EquipmentPayload["tanks"] = [];
  for (const t of draft.tanks) {
    if (!INT_RE.test(t.capacityL.trim()) || !INT_RE.test(t.minLevelPct.trim())) return null;
    const minPct = Number(t.minLevelPct);
    if (Number(t.capacityL) <= 0 || minPct < 0 || minPct > 100) return null;
    tanks.push({ key: t.key, product_code: t.productCode, name: `خزان ${t.productName}`, capacity_l: Number(t.capacityL), min_level_pct: minPct });
  }
  const pumps: EquipmentPayload["pumps"] = [];
  for (const p of draft.pumps) {
    const nozzles: EquipmentPayload["pumps"][number]["nozzles"] = [];
    for (const n of p.nozzles) {
      if (!READING_RE.test(n.lastReading.trim())) return null;
      nozzles.push({ label: n.label, tank_key: n.productCode, last_reading: Number(n.lastReading) });
    }
    pumps.push({ number: p.number, name: `مضخة ${p.number}`, nozzles });
  }
  return { tanks, pumps };
}

export type ReadinessData = {
  station_status: string;
  products: number; tanks: number; pumps: number; nozzles: number;
  prices_set: number; owner_signed_in: boolean;
  attendants: number; attendants_with_pin: number;
  devices: number; subscription: boolean; first_shift_at: string | null;
};
export type ReadinessItem = { key: string; label: string; done: boolean };

/** The 7 items of A2's live checklist («جاهزية أول يوم تشغيل»). Item 1 is always done: the page only loads
 * for a station that already exists. */
export function readinessItems(d: ReadinessData): ReadinessItem[] {
  return [
    { key: "station", label: "إنشاء المحطة", done: true },
    { key: "equipment", label: "خزانات ومضخات متصلة", done: d.tanks > 0 && d.nozzles > 0 },
    { key: "prices", label: "تحديد سعر وقود واحد على الأقل", done: d.prices_set >= 1 },
    { key: "owner", label: "دخول صاحب المحطة أول مرة", done: d.owner_signed_in },
    { key: "attendant_pin", label: "عامل تعبئة برمز دخول", done: d.attendants_with_pin >= 1 },
    { key: "subscription", label: "اختيار باقة اشتراك", done: d.subscription },
    { key: "first_shift", label: "أول مناوبة", done: d.first_shift_at !== null },
  ];
}

export function readinessCount(items: ReadinessItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}
