// Who may decide what, which choices a request offers, and what each choice sends to decide_approval().
// No imports, so `node --test` runs it directly. Mirrors the server (decide_approval / reopen_shift); the server
// still enforces everything — this only explains and prevents dead ends ("don't hide, explain").

export type Role = "owner" | "accountant" | "shift_manager";
export type ApprovalType = "shift_close" | "credit_over_limit" | "stock_adjustment" | "shift_reopen";
export type Choice = "approve" | "shortage_to_expense" | "shortage_to_employee" | "return" | "reject";

/** decide_approval: stock adjustments by owner or shift manager, everything else by the owner only. */
export function canDecide(role: Role, type: ApprovalType): boolean {
  if (type === "stock_adjustment") return role === "owner" || role === "shift_manager";
  return role === "owner";
}

/** Shown next to a disabled decision button. */
export function whoCanDecide(type: ApprovalType): string {
  const label = {
    shift_close: "اعتماد الإغلاق", credit_over_limit: "الموافقة على البيع الآجل",
    stock_adjustment: "اعتماد التسوية", shift_reopen: "فتح المناوبة",
  }[type];
  return type === "stock_adjustment" ? `${label} متاح لصاحب المحطة ومدير المناوبة فقط` : `${label} متاح لصاحب المحطة فقط`;
}

/**
 * The server has no branch for shift_reopen: approving would only mark the request as approved and open nothing.
 * Nothing creates such requests yet, so the decision stays disabled until the database supports it.
 */
export function decisionSupported(type: ApprovalType): boolean {
  return type !== "shift_reopen";
}

export type ChoiceOption = { id: Choice; title: string; hint: string };

/** The radio options of a shift close. A shortage asks where the difference goes; a surplus posts itself. */
export function closeChoices(diffCents: bigint): ChoiceOption[] {
  const back: ChoiceOption = { id: "return", title: "إعادة للعامل للتصحيح", hint: "تُفتح المناوبة مؤقتاً ليعيد الإغلاق" };
  if (diffCents < 0n) {
    return [
      { id: "shortage_to_expense", title: "اعتماد وتحويل الفرق لحساب العجز", hint: "يُنشأ قيد تلقائي" },
      { id: "shortage_to_employee", title: "اعتماد وتحميل الفرق على الموظف", hint: "يظهر في كشف الموظف" },
      back,
    ];
  }
  return [
    { id: "approve", title: diffCents > 0n ? "اعتماد الإغلاق وتسجيل الزيادة" : "اعتماد الإغلاق", hint: "يُنشأ قيد المبيعات والمخزون تلقائياً" },
    back,
  ];
}

export function defaultChoice(type: ApprovalType, diffCents: bigint): Choice {
  return type === "shift_close" ? closeChoices(diffCents)[0].id : "approve";
}

export type Plan = { approve: boolean; option: string | null; reopenAfter: boolean };

/** What to send: `return` = reject the close, then reopen the shift for the attendant. */
export function planFor(choice: Choice): Plan {
  switch (choice) {
    case "approve": return { approve: true, option: null, reopenAfter: false };
    case "shortage_to_expense": return { approve: true, option: "shortage_to_expense", reopenAfter: false };
    case "shortage_to_employee": return { approve: true, option: "shortage_to_employee", reopenAfter: false };
    case "return": return { approve: false, option: null, reopenAfter: true };
    case "reject": return { approve: false, option: null, reopenAfter: false };
  }
}

/** A rejection always needs a note (server: FUELOS_REASON_REQUIRED); the office also asks one for stock adjustments. */
export function noteRequired(type: ApprovalType, choice: Choice): boolean {
  if (choice === "reject" || choice === "return") return true;
  return type === "stock_adjustment";
}

export function noteHint(type: ApprovalType, choice: Choice): string {
  if (choice === "reject") return "اكتب سبب الرفض — يظهر للعامل وفي السجل";
  if (choice === "return") return "اكتب ما يجب تصحيحه — يظهر للعامل وفي السجل";
  if (type === "stock_adjustment") return "اكتب سبب التسوية — يُسجَّل في حركة المخزون";
  return "اختياري — تظهر في السجل";
}
