// FuelOS — attendant PIN login on a registered device (screen L2).
//
// POST { action: "roster", device_id, device_secret }
//   → { station: { id, name }, members: [{ user_id, display_name, role }] }
// POST { action: "login", device_id, device_secret, user_id, pin }
//   → { session: { access_token, refresh_token, expires_at, expires_in, token_type }, user_id, station_id }
// Errors → { error: { code: "FUELOS_*", ... } }. The app maps the code to Arabic; never show it raw.
//
// The device secret comes from issue_device_credential() (migration 20260925000100). PIN checks,
// lockout and audit happen in the database (verify_member_pin); this function only turns a verified
// user into a Supabase session. Deploy with --no-verify-jwt: the caller has no session yet, and the
// device secret is what authenticates the request.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, noSession);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_RE = /^[0-9a-f]{64}$/;
const PIN_RE = /^[0-9]{4,6}$/;

const STATUS: Record<string, number> = {
  FUELOS_BAD_REQUEST: 400,
  FUELOS_DEVICE_NOT_REGISTERED: 401,
  FUELOS_PIN_INVALID: 401,
  FUELOS_PIN_NOT_SET: 404,
  FUELOS_PIN_LOCKED: 423,
  FUELOS_PIN_LOGIN_UNAVAILABLE: 409,
  FUELOS_INTERNAL: 500,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function fail(code: string, extra: Record<string, unknown> = {}): Response {
  return json({ error: { code, ...extra } }, STATUS[code] ?? 400);
}

type RpcResult = { ok: boolean; code?: string; [k: string]: unknown };

async function rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as RpcResult;
}

async function roster(deviceId: string, secret: string): Promise<Response> {
  const res = await rpc("device_roster", { p_device_id: deviceId, p_secret: secret });
  if (!res.ok) return fail(res.code!);
  return json({ station: res.station, members: res.members });
}

async function login(deviceId: string, secret: string, userId: string, pin: string): Promise<Response> {
  const res = await rpc("verify_member_pin", {
    p_device_id: deviceId, p_secret: secret, p_user: userId, p_pin: pin,
  });
  if (!res.ok) {
    const { ok: _ok, code, ...detail } = res;
    return fail(code!, detail);
  }

  // Mint a session without sending anything: generate a magic-link token server-side and redeem it.
  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (userErr || !email) {
    // Attendant accounts need an email (it can be a placeholder address) for this flow.
    return fail("FUELOS_PIN_LOGIN_UNAVAILABLE");
  }
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link?.properties?.hashed_token) throw new Error(`generateLink: ${linkErr?.message}`);

  const anon = createClient(SUPABASE_URL, ANON_KEY, noSession);
  const { data: verified, error: otpErr } = await anon.auth.verifyOtp({
    type: "email", token_hash: link.properties.hashed_token,
  });
  if (otpErr || !verified.session) throw new Error(`verifyOtp: ${otpErr?.message}`);

  const s = verified.session;
  return json({
    session: {
      access_token: s.access_token, refresh_token: s.refresh_token,
      expires_at: s.expires_at, expires_in: s.expires_in, token_type: s.token_type,
    },
    user_id: res.user_id,
    station_id: res.station_id,
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return fail("FUELOS_BAD_REQUEST", { detail: "POST only" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("FUELOS_BAD_REQUEST", { detail: "invalid JSON" });
  }

  const { action, device_id, device_secret, user_id, pin } = body;
  if (typeof device_id !== "string" || device_id.length === 0 || device_id.length > 128 ||
      typeof device_secret !== "string" || !SECRET_RE.test(device_secret)) {
    return fail("FUELOS_DEVICE_NOT_REGISTERED");
  }

  try {
    if (action === "roster") return await roster(device_id, device_secret);
    if (action === "login") {
      if (typeof user_id !== "string" || !UUID_RE.test(user_id)) {
        return fail("FUELOS_BAD_REQUEST", { detail: "user_id" });
      }
      // A malformed PIN is still sent to the database so it counts as a failed attempt.
      return await login(device_id, device_secret, user_id, typeof pin === "string" && PIN_RE.test(pin) ? pin : "");
    }
    return fail("FUELOS_BAD_REQUEST", { detail: "action must be roster or login" });
  } catch (e) {
    console.error(e);
    return fail("FUELOS_INTERNAL");
  }
});
