// «منذ 25 د» style ages, copied from apps/owner-web/lib/time-ago.ts (same small pure helper, no shared
// package yet — see apps/owner-web for the original). No imports, so `node --test` runs it directly.

/** Arabic: منذ لحظات / منذ دقيقة / منذ دقيقتين / منذ 5 دقائق / منذ 12 دقيقة / منذ ساعة / منذ ساعتين / … / منذ يوم / منذ 3 أيام */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "منذ لحظات";
  if (minutes < 60) return `منذ ${unit(minutes, "دقيقة", "دقيقتين", "دقائق", "دقيقة")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${unit(hours, "ساعة", "ساعتين", "ساعات", "ساعة")}`;
  const days = Math.floor(hours / 24);
  return `منذ ${unit(days, "يوم", "يومين", "أيام", "يوماً")}`;
}

function unit(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}
