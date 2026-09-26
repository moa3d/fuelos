// Supabase Auth error code → Arabic (office login L1, customer login L3). Never show the raw code.

const messages: Record<string, string> = {
  invalid_credentials: "البريد أو الهاتف أو كلمة المرور غير صحيحة",
  email_not_confirmed: "لم يُؤكَّد البريد بعد — افتح رسالة التأكيد أولاً",
  phone_not_confirmed: "لم يُؤكَّد رقم الهاتف بعد",
  user_not_found: "لا يوجد حساب بهذا البريد أو الهاتف — اطلب من صاحب المحطة دعوتك",
  otp_expired: "انتهت صلاحية الرمز أو أنه غير صحيح — اطلب رمزاً جديداً",
  otp_disabled: "الدخول برمز لمرة واحدة غير مفعّل — استخدم كلمة المرور",
  over_request_rate_limit: "محاولات كثيرة — انتظر دقيقة ثم حاول مرة أخرى",
  over_email_send_rate_limit: "أُرسلت رسائل كثيرة — انتظر قليلاً ثم اطلب رمزاً جديداً",
  over_sms_send_rate_limit: "أُرسلت رسائل كثيرة — انتظر قليلاً ثم اطلب رمزاً جديداً",
  sms_send_failed: "تعذّر إرسال الرسالة النصية — استخدم البريد أو كلمة المرور",
  phone_provider_disabled: "الدخول برسالة نصية غير مفعّل بعد — استخدم البريد",
  email_provider_disabled: "الدخول بالبريد غير مفعّل — اتصل بفريق FuelOS",
  signup_disabled: "لا يوجد حساب بهذا البريد أو الهاتف — اطلب من صاحب المحطة دعوتك",
  weak_password: "كلمة المرور ضعيفة — استخدم 8 أحرف على الأقل مع أرقام",
  same_password: "اختر كلمة مرور مختلفة عن السابقة",
  session_not_found: "انتهت الجلسة — ادخل من جديد",
  session_expired: "انتهت الجلسة — ادخل من جديد",
};

export const AUTH_NETWORK_MESSAGE = "لا يوجد اتصال بالإنترنت — تحقق من الشبكة ثم حاول مرة أخرى";
export const AUTH_FALLBACK_MESSAGE = "تعذّر الدخول الآن — حاول بعد قليل";

/** `error` is a Supabase AuthError (or anything with code/status/name). */
export function authErrorMessage(error: { code?: string; status?: number; name?: string } | null | undefined): string {
  if (!error) return AUTH_FALLBACK_MESSAGE;
  if (error.name === "AuthRetryableFetchError" || error.status === 0) return AUTH_NETWORK_MESSAGE;
  return (error.code && messages[error.code]) || AUTH_FALLBACK_MESSAGE;
}
