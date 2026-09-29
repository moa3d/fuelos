// FuelOS — the platform admin onboards a client's station (admin app A2 «انضمام محطة جديدة»). Pure request
// handling; the Supabase calls are injected (index.ts), so this file runs under `node --test` too.
//
// POST (Authorization: Bearer <platform admin's session>)
//   { action: "create", station_name, owner_name, owner_email, org_name?, currency?, city?, plan_id?, trial_days?, lat?, lng? }
//     → 200 { organization_id, station_id, owner_user_id, login: { token_hash, type: "invite" } | null }
//     A new owner gets a new account and a one-time invite link (nothing is emailed): the admin app builds
//     `${OWNER_WEB_URL}/welcome?token_hash=…&type=invite` and sends it to the owner (e.g. on WhatsApp);
//     /welcome signs in with verifyOtp and asks for a password. An owner who already uses FuelOS gets login null:
//     he signs in as usual and sees the new station.
//   { action: "link", station_id }
//     → 200 { owner_user_id, login } — a fresh link while the owner has never signed in (links expire);
//       409 FUELOS_ALREADY_ACTIVE once he has (he uses his password, or «نسيت كلمة المرور»).
// Errors → { error: { code, detail? } }: FUELOS_PERMISSION_DENIED (403), FUELOS_BAD_REQUEST (400),
// FUELOS_NOT_FOUND (404), FUELOS_ALREADY_ACTIVE (409), FUELOS_INTERNAL (500).

export type Login = { token_hash: string; type: "invite" };
export type StationInput = {
  owner: string; owner_name: string; station_name: string; org_name: string | null; currency: string;
  city: string | null; plan_id: string | null; trial_days: number; lat: number | null; lng: number | null;
};

export type Deps = {
  /** The caller's user id if the session belongs to a platform admin. */
  callerIsPlatformAdmin(jwt: string): Promise<{ userId: string } | { error: "forbidden" }>;
  findUserByEmail(email: string): Promise<string | null>;
  /** A new account + its one-time invite link (nothing is emailed). */
  createInviteLink(email: string, fullName: string): Promise<{ userId: string; login: Login } | { error: string }>;
  /** A fresh invite link for an account that has NEVER signed in; "already_active" otherwise — the platform never
   *  gets a link into an account in use (that would let staff sign in as the owner). */
  loginLinkFor(userId: string): Promise<{ login: Login } | { error: "already_active" | string }>;
  /** admin_create_station(): throws Error("FUELOS_…") for a refused input. */
  createStation(actor: string, input: StationInput): Promise<{ organization_id: string; station_id: string }>;
  stationOwner(stationId: string): Promise<string | null>;
};

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function fail(status: number, code: string, detail?: string): Response {
  return json({ error: { code, ...(detail ? { detail } : {}) } }, status);
}
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() !== "" && v.trim().length <= max ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(400, "FUELOS_BAD_REQUEST", "POST only");

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return fail(403, "FUELOS_PERMISSION_DENIED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "FUELOS_BAD_REQUEST", "invalid JSON");
  }

  try {
    if (body.action === "link") {
      const stationId = typeof body.station_id === "string" && UUID_RE.test(body.station_id) ? body.station_id : null;
      if (!stationId) return fail(400, "FUELOS_BAD_REQUEST", "station_id");
      const caller = await deps.callerIsPlatformAdmin(jwt);
      if ("error" in caller) return fail(403, "FUELOS_PERMISSION_DENIED");
      const owner = await deps.stationOwner(stationId);
      if (!owner) return fail(404, "FUELOS_NOT_FOUND", "owner");
      const fresh = await deps.loginLinkFor(owner);
      if ("error" in fresh) {
        if (fresh.error === "already_active") return fail(409, "FUELOS_ALREADY_ACTIVE");
        throw new Error(`loginLinkFor: ${fresh.error}`);
      }
      return json({ owner_user_id: owner, login: fresh.login });
    }

    if (body.action !== "create") return fail(400, "FUELOS_BAD_REQUEST", "action");
    const stationName = text(body.station_name, 80);
    const ownerName = text(body.owner_name, 80);
    const email = typeof body.owner_email === "string" ? body.owner_email.trim().toLowerCase() : "";
    const currency = body.currency === undefined ? "SYP" : typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
    const planId = body.plan_id === undefined || body.plan_id === null ? null : String(body.plan_id);
    const trialDays = body.trial_days === undefined ? 14 : num(body.trial_days);
    const lat = body.lat === undefined || body.lat === null ? null : num(body.lat);
    const lng = body.lng === undefined || body.lng === null ? null : num(body.lng);
    if (!stationName) return fail(400, "FUELOS_BAD_REQUEST", "station_name");
    if (!ownerName) return fail(400, "FUELOS_BAD_REQUEST", "owner_name");
    if (!EMAIL_RE.test(email)) return fail(400, "FUELOS_BAD_REQUEST", "owner_email");
    if (!/^[A-Z]{3}$/.test(currency)) return fail(400, "FUELOS_BAD_REQUEST", "currency");
    if (planId !== null && !UUID_RE.test(planId)) return fail(400, "FUELOS_BAD_REQUEST", "plan_id");
    if (trialDays === null || !Number.isInteger(trialDays) || trialDays < 0 || trialDays > 90) return fail(400, "FUELOS_BAD_REQUEST", "trial_days");
    if ((body.lat != null && lat === null) || (body.lng != null && lng === null) || (lat === null) !== (lng === null)
        || (lat !== null && Math.abs(lat) > 90) || (lng !== null && Math.abs(lng) > 180)) {
      return fail(400, "FUELOS_BAD_REQUEST", "lat/lng");
    }

    const caller = await deps.callerIsPlatformAdmin(jwt);
    if ("error" in caller) return fail(403, "FUELOS_PERMISSION_DENIED");

    // the owner's account first (an orphan account from a failed attempt is simply reused on retry)
    let owner = await deps.findUserByEmail(email);
    let login: Login | null;
    if (owner) {
      const fresh = await deps.loginLinkFor(owner);
      if ("error" in fresh && fresh.error !== "already_active") throw new Error(`loginLinkFor: ${fresh.error}`);
      login = "login" in fresh ? fresh.login : null;
    } else {
      const made = await deps.createInviteLink(email, ownerName);
      if ("error" in made) throw new Error(`createInviteLink: ${made.error}`);
      owner = made.userId;
      login = made.login;
    }

    let created: { organization_id: string; station_id: string };
    try {
      created = await deps.createStation(caller.userId, {
        owner, owner_name: ownerName, station_name: stationName, org_name: text(body.org_name, 80), currency,
        city: text(body.city, 80), plan_id: planId, trial_days: trialDays, lat, lng,
      });
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "FUELOS_NOT_FOUND") return fail(404, code, "plan");
      if (code === "FUELOS_REQUIRED" || code === "FUELOS_BAD_REQUEST") return fail(400, "FUELOS_BAD_REQUEST");
      if (code === "FUELOS_PERMISSION_DENIED") return fail(403, code);
      throw e;
    }
    return json({ ...created, owner_user_id: owner, login });
  } catch (e) {
    console.error(e);
    return fail(500, "FUELOS_INTERNAL");
  }
}
