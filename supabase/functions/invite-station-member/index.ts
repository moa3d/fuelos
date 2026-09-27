// FuelOS — invite-station-member Edge Function: wires handler.ts to Supabase.
// Deployed WITH JWT verification: the caller is the signed-in owner (owner-web O11).
// The service role is used only here, never in the apps (CLAUDE.md rule 7).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handle, type Deps } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, noSession);

// Supabase's built-in mailer only delivers to the project's team; without custom SMTP an invite fails to send.
const EMAIL_PROBLEM = /smtp|sending|send .*email|not authorized|rate limit/i;

const deps: Deps = {
  async callerIsOwner(jwt, stationId) {
    const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
      ...noSession, global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data, error } = await asCaller.auth.getUser(jwt);
    if (error || !data.user) return { error: "forbidden" };
    const check = await asCaller.rpc("require_role", { p_station: stationId, p_roles: ["owner"] });
    return check.error ? { error: "forbidden" } : { userId: data.user.id };
  },
  async findUserByEmail(email) {
    const { data, error } = await admin.rpc("user_id_by_email", { p_email: email });
    if (error) throw new Error(`user_id_by_email: ${error.message}`);
    return (data as string | null) ?? null;
  },
  async inviteByEmail(email, displayName) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: displayName } });
    if (error || !data.user) {
      console.warn(`inviteUserByEmail failed: ${error?.message}`);
      return { error: EMAIL_PROBLEM.test(error?.message ?? "") ? "email_unavailable" : (error?.message ?? "no user") };
    }
    return { userId: data.user.id };
  },
  async createAttendant(email, displayName) {
    const { data, error } = await admin.auth.admin.createUser({
      email, email_confirm: true, user_metadata: { full_name: displayName },
    });
    return error || !data.user ? { error: error?.message ?? "no user" } : { userId: data.user.id };
  },
  async memberExists(stationId, userId) {
    const { data, error } = await admin.from("station_members").select("user_id")
      .eq("station_id", stationId).eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`station_members: ${error.message}`);
    return !!data;
  },
  async insertMember(row) {
    const { error } = await admin.from("station_members").insert(row);
    if (error) throw new Error(`insert station_members: ${error.message}`);
  },
  async audit(row) {
    const { error } = await admin.from("audit_log").insert(row);
    if (error) console.error(`audit_log: ${error.message}`);   // the membership exists; don't fail the invite
  },
  newId: () => crypto.randomUUID(),
};

Deno.serve((req) => handle(req, deps));
