// C7 «شكاواي» — picking each complaint's latest message for the list card (replaces showing `subject`).
// No imports, so `node --test` runs it directly; complaints-data.ts (which does import @fuelos/core/./supabase)
// calls this with the rows from its own `complaint_messages` query.

export type LastMessageRow = {
  complaintId: string;
  authorSide: "customer" | "station" | "platform";
  body: string;
  createdAt: string;
};

export type LastMessage = { body: string; authorSide: "customer" | "station" | "platform"; createdAt: string };

/**
 * `rows` must already be sorted by `createdAt` descending (as the `complaint_messages` query orders them) —
 * the first row seen for a given `complaintId` is therefore its latest message. `ids` is every complaint id
 * on the page, so a complaint with no messages at all still gets an explicit `null` entry rather than being
 * left out of the map.
 */
export function pickLastMessages(rows: LastMessageRow[], ids: string[]): Map<string, LastMessage | null> {
  const result = new Map<string, LastMessage | null>(ids.map((id) => [id, null]));
  for (const r of rows) {
    if (result.get(r.complaintId) === null) {
      result.set(r.complaintId, { body: r.body, authorSide: r.authorSide, createdAt: r.createdAt });
    }
  }
  return result;
}
