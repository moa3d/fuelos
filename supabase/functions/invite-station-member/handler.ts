// FuelOS — invite a person to a station (owner-web O11 «+ دعوة مستخدم»). Pure request handling; the Supabase
// calls are injected (index.ts), so this file runs under `node --test` too.
//
// POST (Authorization: Bearer <owner's session>) { station_id, role, display_name, email? }
//   → 200 { user_id, status: "invited" | "active", email_sent }
//   • office roles (owner / accountant / shift_manager) need an email: a new account gets Supabase's invitation
//     email and an 'invited' membership, which the app activates with accept_station_invites() after sign-in;
//   • an attendant may have no email: he gets an account for the PIN login (placeholder address, nothing is sent)
//     and an 'active' membership; the owner then sets his PIN (set_member_pin);
//   • an existing account is added without a new email.
// Errors → { error: { code } }: FUELOS_PERMISSION_DENIED (403), FUELOS_BAD_REQUEST (400), FUELOS_ALREADY_MEMBER (409),
// FUELOS_EMAIL_UNAVAILABLE (503: the project has no email sender set up), FUELOS_INTERNAL (500).

export type Role = "owner" | "accountant" | "shift_manager" | "attendant";
export type MemberRow = { station_id: string; user_id: string; role: Role; status: "invited" | "active"; display_name: string };

export type Deps = {
  /** The caller's user id if the session belongs to an active owner of the station. */
  callerIsOwner(jwt: string, stationId: string): Promise<{ userId: string } | { error: "forbidden" }>;
  findUserByEmail(email: string): Promise<string | null>;
  inviteByEmail(email: string, displayName: string): Promise<{ userId: string } | { error: "email_unavailable" | string }>;
  createAttendant(email: string, displayName: string): Promise<{ userId: string } | { error: string }>;
  memberExists(stationId: string, userId: string): Promise<boolean>;
  insertMember(row: MemberRow): Promise<void>;
  audit(row: Record<string, unknown>): Promise<void>;
  newId(): string;
};

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};
const ROLES: Role[] = ["owner", "accountant", "shift_manager", "attendant"];
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
  const stationId = typeof body.station_id === "string" ? body.station_id : "";
  const role = body.role as Role;
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  const email = typeof body.email === "string" && body.email.trim() !== "" ? body.email.trim().toLowerCase() : null;
  if (!UUID_RE.test(stationId)) return fail(400, "FUELOS_BAD_REQUEST", "station_id");
  if (!ROLES.includes(role)) return fail(400, "FUELOS_BAD_REQUEST", "role");
  if (displayName === "" || displayName.length > 80) return fail(400, "FUELOS_BAD_REQUEST", "display_name");
  if (email !== null && !EMAIL_RE.test(email)) return fail(400, "FUELOS_BAD_REQUEST", "email");
  if (email === null && role !== "attendant") return fail(400, "FUELOS_BAD_REQUEST", "email");

  try {
    const caller = await deps.callerIsOwner(jwt, stationId);
    if ("error" in caller) return fail(403, "FUELOS_PERMISSION_DENIED");

    let userId = email ? await deps.findUserByEmail(email) : null;
    let emailSent = false;
    if (userId) {
      if (await deps.memberExists(stationId, userId)) return fail(409, "FUELOS_ALREADY_MEMBER");
    } else if (role === "attendant") {
      const created = await deps.createAttendant(email ?? `attendant-${deps.newId()}@noemail.fuelos.app`, displayName);
      if ("error" in created) throw new Error(`createAttendant: ${created.error}`);
      userId = created.userId;
    } else {
      const invited = await deps.inviteByEmail(email!, displayName);
      if ("error" in invited) {
        if (invited.error === "email_unavailable") return fail(503, "FUELOS_EMAIL_UNAVAILABLE");
        throw new Error(`inviteByEmail: ${invited.error}`);
      }
      userId = invited.userId;
      emailSent = true;
    }

    const status = role === "attendant" ? "active" : "invited";
    await deps.insertMember({ station_id: stationId, user_id: userId, role, status, display_name: displayName });
    await deps.audit({
      actor_id: caller.userId, station_id: stationId, action: "invite_member", entity: "station_members",
      entity_id: userId, after: { role, status, display_name: displayName, email_sent: emailSent },
    });
    return json({ user_id: userId, status, email_sent: emailSent });
  } catch (e) {
    console.error(e);
    return fail(500, "FUELOS_INTERNAL");
  }
}
