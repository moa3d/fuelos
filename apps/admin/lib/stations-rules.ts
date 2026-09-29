// «المحطات» — the platform-wide station list. No imports, so `node --test` runs it directly.

export type StationStatus = "setup" | "active" | "suspended";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export function stationBadge(status: StationStatus): { tone: Tone; label: string } {
  switch (status) {
    case "setup": return { tone: "info", label: "قيد الإعداد" };
    case "active": return { tone: "success", label: "نشطة" };
    case "suspended": return { tone: "danger", label: "موقوفة" };
  }
}

/** Case-insensitive substring match for the search box, over the station's name and city together. */
export function matchesSearch(name: string, city: string | null, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (q === "") return true;
  return name.toLocaleLowerCase().includes(q) || (city ?? "").toLocaleLowerCase().includes(q);
}
