// C7 «شكاواي» helpers — the customer's own view of a complaint's status (design/screens/C7.png). No imports,
// so `node --test` runs it directly.

export type ComplaintStatus = "open" | "awaiting_station" | "resolved" | "escalated";
export type ComplaintKind = "complaint" | "price_report";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export function complaintBadge(status: ComplaintStatus): { tone: Tone; label: string } {
  switch (status) {
    case "open": case "awaiting_station": return { tone: "warning", label: "قيد الرد" };
    case "resolved": return { tone: "success", label: "تم الحل" };
    case "escalated": return { tone: "info", label: "مصعّدة للمنصة" };
  }
}

export const KIND_LABEL: Record<ComplaintKind, string> = { complaint: "شكوى", price_report: "بلاغ سعر" };

/** The 3-step timeline in the design: أُرسلت (always done) → قيد الرد → تم الحل. */
export type Step = "sent" | "in_progress" | "resolved";
export function timelineStep(status: ComplaintStatus): Step {
  if (status === "resolved") return "resolved";
  if (status === "open") return "sent";
  return "in_progress"; // awaiting_station, escalated
}
