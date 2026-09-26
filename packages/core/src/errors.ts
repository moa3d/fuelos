// FUELOS_* error code → Arabic message. The user never sees the raw code.
// Source of truth for the wording: .claude/skills/fuelos-offline-sync (keep both in sync).
import { formatTime } from "./format";

export type ErrorDetail = Record<string, unknown> | undefined;

export const FALLBACK_MESSAGE = "حدث خطأ غير متوقع — حاول مرة أخرى";

// L2 only: don't reuse these on other screens (S2 has its own offline story: sales save on the device).
export const LOGIN_NETWORK_MESSAGE = "لا يوجد اتصال — الدخول يحتاج إنترنت أول مرة";
export const LOGIN_UNAVAILABLE_MESSAGE = "تعذّر الدخول الآن — حاول بعد قليل";

/** A pump taken offline by two attendants: the server kept the first leg (spec §7). */
export const PUMP_TAKEN_OFFLINE_MESSAGE = "المضخة كانت مسجّلة مع زميل — راجع المدير";

/** «بقيت محاولة واحدة» / «بقيت محاولتان» / «بقيت 3 محاولات» */
export function attemptsLeftText(n: number): string {
  if (n === 1) return "بقيت محاولة واحدة";
  if (n === 2) return "بقيت محاولتان";
  return `بقيت ${n} محاولات`;
}

const messages: Record<string, (d: ErrorDetail) => string> = {
  // L2 — attendant PIN login
  FUELOS_PIN_INVALID: (d) =>
    typeof d?.attempts_left === "number" ? `الرمز غير صحيح — ${attemptsLeftText(d.attempts_left)}` : "الرمز غير صحيح",
  FUELOS_PIN_LOCKED: (d) =>
    typeof d?.locked_until === "string" ? `تم إيقاف الدخول مؤقتاً حتى ${formatTime(d.locked_until)}` : "تم إيقاف الدخول مؤقتاً",
  FUELOS_DEVICE_NOT_REGISTERED: () => "هذا الجهاز غير مسجّل لمحطة — اطلب من المدير تسجيله",
  FUELOS_PIN_NOT_SET: () => "لم يُحدَّد لك رمز بعد — اطلب من صاحب المحطة",
  FUELOS_PIN_LOGIN_UNAVAILABLE: () => LOGIN_UNAVAILABLE_MESSAGE,

  // permissions
  FUELOS_PERMISSION_DENIED: () => "هذا الإجراء غير متاح لحسابك — اطلبه من مدير المناوبة أو صاحب المحطة",
  "42501": () => "هذا الإجراء غير متاح لحسابك — اطلبه من مدير المناوبة أو صاحب المحطة",

  // shifts & sales
  FUELOS_PUMP_BUSY: () => "هذه المضخة مع زميل الآن",
  FUELOS_SHIFT_ALREADY_OPEN: () => "لديك مناوبة مفتوحة — أكملها أو أغلقها أولاً",
  FUELOS_GAP_NOTE_REQUIRED: () => "القراءة أعلى من آخر قراءة مسجّلة — اكتب السبب",
  FUELOS_READING_ABOVE_NEXT: () => "القراءة أعلى من بداية مناوبة زميل على هذه المضخة — راجع المدير",
  FUELOS_BAD_SHIFT_TRANSITION: () => "المناوبة ليست مفتوحة الآن — راجع المدير",
  FUELOS_READING_MISSING: () => "أدخل قراءة كل مسدس قبل المتابعة",
  FUELOS_READING_BELOW_LAST: () => "القراءة أقل من آخر قراءة مسجلة لهذا المسدس",
  FUELOS_SHIFT_NOT_OPEN: () => "المناوبة مغلقة أو بانتظار الاعتماد",
  FUELOS_CREDIT_LIMIT: (d) => `الحد المتبقي لا يكفي: يمكن تعبئة ${num(d?.possible_liters)} لتر فقط`,
  FUELOS_COMPANY_FROZEN: () => "حساب الشركة مجمّد — البيع نقداً فقط",
  FUELOS_COMPANY_SUSPENDED: () => "حساب الشركة موقوف — البيع نقداً فقط",
  FUELOS_DRIVER_NOT_AUTHORIZED: () => "السائق غير مصرّح له على حساب الشركة",
  FUELOS_REASON_REQUIRED: () => "الفرق أكبر من الحد المسموح — اكتب السبب",
  FUELOS_NO_PRICE: () => "لا يوجد سعر منشور لهذا الوقود — اتصل بالمدير",
  FUELOS_ID_CONFLICT: () => "تعذّر حفظ العملية — تواصل مع الدعم",
  FUELOS_NOT_FOUND: () => "لم نجد هذا العنصر — ربما تغيّر، حدّث الصفحة وحاول مرة أخرى",
  FUELOS_PENDING_APPROVALS: () => "هناك عمليات آجل بانتظار قرارك في هذه المناوبة",
  FUELOS_PERIOD_CLOSED: () => "الفترة المحاسبية مغلقة — سجّل التسوية في الفترة الحالية",
};

function num(v: unknown): string {
  return typeof v === "number" ? new Intl.NumberFormat("en-US").format(v) : String(v ?? "");
}

/** Arabic message for a FUELOS_* code; unknown codes get the generic fallback. */
export function errorMessage(code: string | undefined, detail?: ErrorDetail): string {
  const fn = code ? messages[code] : undefined;
  return fn ? fn(detail) : FALLBACK_MESSAGE;
}

/** Same as errorMessage, but server/unknown failures read as «تعذّر الدخول الآن» on the login screen. */
export function loginErrorMessage(code: string | undefined, detail?: ErrorDetail): string {
  return code && code in messages ? errorMessage(code, detail) : LOGIN_UNAVAILABLE_MESSAGE;
}

export function isKnownError(code: string | undefined): boolean {
  return !!code && code in messages;
}
