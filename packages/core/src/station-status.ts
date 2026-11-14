export type CrowdLevel = "none" | "medium" | "high";
export type OpenSource = "manual" | "shift";
export type StatusTone = "success" | "warning" | "danger" | "neutral";

export const CROWD_FRESH_MS = 90 * 60_000;
export const OPEN_FRESH_MS = 12 * 60 * 60_000;

export type StationStatusRow = {
  is_open: boolean | null;
  open_set_at: string | null;
  crowd: CrowdLevel | null;
  crowd_set_at: string | null;
  has_open_shift?: boolean;
};

export type StationStatusView = {
  isOpen: boolean | null;
  openSource: OpenSource | null;
  openSetAt: string | null;
  crowd: CrowdLevel | null;
  crowdSetAt: string | null;
  crowdStale: boolean;
};

export function stationStatusView(row: StationStatusRow, now?: number): StationStatusView {
  const timestamp = now ?? Date.now();

  // Determine open status and source
  let isOpen: boolean | null = null;
  let openSource: OpenSource | null = null;
  let openSetAt: string | null = row.open_set_at;

  if (row.open_set_at !== null && row.is_open !== null) {
    const age = timestamp - Date.parse(row.open_set_at);
    if (age <= OPEN_FRESH_MS) {
      // Manual press is fresh
      isOpen = row.is_open;
      openSource = "manual";
    } else {
      // Manual press is stale, check for shift
      if (row.has_open_shift) {
        isOpen = true;
        openSource = "shift";
      }
    }
  } else if (row.has_open_shift) {
    isOpen = true;
    openSource = "shift";
  }

  // Determine crowd status and staleness
  let crowd: CrowdLevel | null = null;
  let crowdSetAt: string | null = row.crowd_set_at;
  let crowdStale = false;

  if (row.crowd_set_at !== null && row.crowd !== null) {
    const age = timestamp - Date.parse(row.crowd_set_at);
    if (age <= CROWD_FRESH_MS) {
      // Crowd is fresh (handles negative age for clock skew)
      crowd = row.crowd;
      crowdStale = false;
    } else {
      // Crowd is stale
      crowd = null;
      crowdStale = true;
    }
  } else {
    crowdStale = true;
  }

  return {
    isOpen,
    openSource,
    openSetAt,
    crowd,
    crowdSetAt,
    crowdStale,
  };
}

export function openBadge(isOpen: boolean | null): { tone: StatusTone; label: string } {
  if (isOpen === true) {
    return { tone: "success", label: "مفتوحة" };
  } else if (isOpen === false) {
    return { tone: "neutral", label: "مغلقة" };
  } else {
    return { tone: "neutral", label: "غير معروف" };
  }
}

export function crowdBadge(crowd: CrowdLevel): { tone: StatusTone; label: string } {
  switch (crowd) {
    case "none":
      return { tone: "success", label: "لا زحام" };
    case "medium":
      return { tone: "warning", label: "زحام متوسط" };
    case "high":
      return { tone: "danger", label: "زحمة شديدة" };
  }
}
