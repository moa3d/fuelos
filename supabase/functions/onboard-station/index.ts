// FuelOS — onboard-station Edge Function: wires handler.ts to Supabase.
// Deployed WITH JWT verification: the caller is a signed-in platform admin (admin app A2).
// The service role is used only here, never in the apps (CLAUDE.md rule 7).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handle, type Deps } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, noSession);

// One-time invite links, built by Supabase but NOT emailed. Only for accounts that never signed in.
async function inviteLink(email: string, fullName?: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { data: { full_name: fullName } } });
  if (error || !data.user || !data.properties?.hashed_token) return { error: error?.message ?? "no link" } as const;
  return { userId: data.user.id, login: { token_hash: data.properties.hashed_token, type: "invite" as const } } as const;
}

const deps: Deps = {
  async callerIsPlatformAdmin(jwt) {
    const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
      ...noSession, global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data, error } = await asCaller.auth.getUser(jwt);
    if (error || !data.user) return { error: "forbidden" };
    const check = await asCaller.rpc("is_platform_admin");
    return check.error || check.data !== true ? { error: "forbidden" } : { userId: data.user.id };
  },
  async findUserByEmail(email) {
    const { data, error } = await admin.rpc("user_id_by_email", { p_email: email });
    if (error) throw new Error(`user_id_by_email: ${error.message}`);
    return (data as string | null) ?? null;
  },
  async createInviteLink(email, fullName) {
    return await inviteLink(email, fullName);
  },
  async loginLinkFor(userId) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user?.email) return { error: error?.message ?? "no user" };
    if (data.user.email_confirmed_at || data.user.last_sign_in_at) return { error: "already_active" };
    const made = await inviteLink(data.user.email);
    return "error" in made ? made : { login: made.login };
  },
  async createStation(actor, i) {
    const { data, error } = await admin.rpc("admin_create_station", {
      p_actor: actor, p_owner: i.owner, p_owner_name: i.owner_name, p_station_name: i.station_name,
      p_org_name: i.org_name, p_currency: i.currency, p_city: i.city, p_plan: i.plan_id,
      p_trial_days: i.trial_days, p_lat: i.lat, p_lng: i.lng,
    });
    if (error) throw new Error(error.message.startsWith("FUELOS_") ? error.message : `admin_create_station: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as { organization_id: string; station_id: string } | undefined;
    if (!row) throw new Error("admin_create_station: no row");
    return row;
  },
  async stationOwner(stationId) {
    const { data, error } = await admin.from("station_members").select("user_id")
      .eq("station_id", stationId).eq("role", "owner").order("created_at").limit(1).maybeSingle();
    if (error) throw new Error(`station_members: ${error.message}`);
    return (data?.user_id as string | undefined) ?? null;
  },
};

Deno.serve((req) => handle(req, deps));
