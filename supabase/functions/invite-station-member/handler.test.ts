// Unit tests for the invite handler (no network): node --test supabase/functions/invite-station-member/handler.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { handle, type Deps, type MemberRow } from "./handler.ts";

const STATION = "7d7a5f0e-0000-4000-8000-000000000001";
const OWNER = "11111111-0000-4000-8000-000000000001";

function fakeDeps(over: Partial<Deps> = {}) {
  const calls = { members: [] as MemberRow[], audits: [] as Record<string, unknown>[], invites: [] as string[], created: [] as string[] };
  const deps: Deps = {
    callerIsOwner: async (jwt) => (jwt === "owner-jwt" ? { userId: OWNER } : { error: "forbidden" }),
    findUserByEmail: async () => null,
    inviteByEmail: async (email) => { calls.invites.push(email); return { userId: "u-invited" }; },
    createAttendant: async (email) => { calls.created.push(email); return { userId: "u-attendant" }; },
    memberExists: async () => false,
    insertMember: async (row) => { calls.members.push(row); },
    audit: async (row) => { calls.audits.push(row); },
    newId: () => "0f0f",
    ...over,
  };
  return { deps, calls };
}

function post(body: unknown, jwt = "owner-jwt") {
  return new Request("http://x/invite-station-member", {
    method: "POST", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
const code = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;

test("the browser preflight gets CORS headers", async () => {
  const { deps } = fakeDeps();
  const r = await handle(new Request("http://x", { method: "OPTIONS" }), deps);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
});

test("only the station owner can invite", async () => {
  const { deps, calls } = fakeDeps();
  const r = await handle(post({ station_id: STATION, role: "accountant", display_name: "ليلى", email: "l@x.com" }, "other-jwt"), deps);
  assert.equal(r.status, 403);
  assert.equal(await code(r), "FUELOS_PERMISSION_DENIED");
  assert.equal(calls.members.length, 0);
});

test("an office role gets an invitation email and an 'invited' membership", async () => {
  const { deps, calls } = fakeDeps();
  const r = await handle(post({ station_id: STATION, role: "accountant", display_name: " ليلى حداد ", email: "Laila@X.com" }), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { user_id: "u-invited", status: "invited", email_sent: true });
  assert.deepEqual(calls.invites, ["laila@x.com"]);
  assert.deepEqual(calls.members, [{ station_id: STATION, user_id: "u-invited", role: "accountant", status: "invited", display_name: "ليلى حداد" }]);
  assert.equal(calls.audits.length, 1);
  assert.equal(calls.audits[0].actor_id, OWNER);
});

test("an office role needs an email", async () => {
  const { deps } = fakeDeps();
  const r = await handle(post({ station_id: STATION, role: "shift_manager", display_name: "سامر" }), deps);
  assert.equal(r.status, 400);
  assert.equal(await code(r), "FUELOS_BAD_REQUEST");
});

test("an attendant without email gets an account for PIN login, active at once, no email sent", async () => {
  const { deps, calls } = fakeDeps();
  const r = await handle(post({ station_id: STATION, role: "attendant", display_name: "يوسف" }), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { user_id: "u-attendant", status: "active", email_sent: false });
  assert.deepEqual(calls.created, ["attendant-0f0f@noemail.fuelos.app"]);
  assert.equal(calls.invites.length, 0);
});

test("an existing account is added without a new invitation", async () => {
  const { deps, calls } = fakeDeps({ findUserByEmail: async () => "u-existing" });
  const r = await handle(post({ station_id: STATION, role: "accountant", display_name: "ليلى", email: "l@x.com" }), deps);
  assert.deepEqual(await r.json(), { user_id: "u-existing", status: "invited", email_sent: false });
  assert.equal(calls.invites.length, 0);
});

test("someone already on the team is refused", async () => {
  const { deps } = fakeDeps({ findUserByEmail: async () => "u-existing", memberExists: async () => true });
  const r = await handle(post({ station_id: STATION, role: "accountant", display_name: "ليلى", email: "l@x.com" }), deps);
  assert.equal(r.status, 409);
  assert.equal(await code(r), "FUELOS_ALREADY_MEMBER");
});

test("when email sending is not set up, nothing is added and the app is told why", async () => {
  const { deps, calls } = fakeDeps({ inviteByEmail: async () => ({ error: "email_unavailable" }) });
  const r = await handle(post({ station_id: STATION, role: "accountant", display_name: "ليلى", email: "l@x.com" }), deps);
  assert.equal(r.status, 503);
  assert.equal(await code(r), "FUELOS_EMAIL_UNAVAILABLE");
  assert.equal(calls.members.length, 0);
});

test("bad input is refused before anything is created", async () => {
  const { deps, calls } = fakeDeps();
  for (const body of [
    { station_id: "nope", role: "accountant", display_name: "x", email: "l@x.com" },
    { station_id: STATION, role: "king", display_name: "x", email: "l@x.com" },
    { station_id: STATION, role: "accountant", display_name: "  ", email: "l@x.com" },
    { station_id: STATION, role: "accountant", display_name: "x", email: "not-an-email" },
  ]) {
    const r = await handle(post(body), deps);
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.equal(calls.members.length + calls.invites.length + calls.created.length, 0);
});
