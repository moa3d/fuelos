// Unit tests for the invite handler (no network): node --test supabase/functions/invite-station-member/handler.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { handle, type Deps, type Login, type MemberRow } from "./handler.ts";

const STATION = "7d7a5f0e-0000-4000-8000-000000000001";
const OWNER = "11111111-0000-4000-8000-000000000001";
const LINK: Login = { token_hash: "th-new", type: "invite" };

function fakeDeps(over: Partial<Deps> = {}) {
  const calls = { members: [] as MemberRow[], audits: [] as Record<string, unknown>[], invites: [] as string[], created: [] as string[] };
  const deps: Deps = {
    callerIsOwner: async (jwt) => (jwt === "owner-jwt" ? { userId: OWNER } : { error: "forbidden" }),
    findUserByEmail: async () => null,
    createInviteLink: async (email) => { calls.invites.push(email); return { userId: "u-invited", login: LINK }; },
    loginLinkFor: async () => ({ error: "already_active" }),
    createAttendant: async (email) => { calls.created.push(email); return { userId: "u-attendant" }; },
    memberStatus: async () => null,
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

test("an office role gets a join link (no email) and an 'invited' membership", async () => {
  const { deps, calls } = fakeDeps();
  const r = await handle(post({ station_id: STATION, role: "accountant", display_name: " ليلى حداد ", email: "Laila@X.com" }), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { user_id: "u-invited", status: "invited", login: LINK });
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

test("an attendant without email gets an account for PIN login, active at once, no link", async () => {
  const { deps, calls } = fakeDeps();
  const r = await handle(post({ station_id: STATION, role: "attendant", display_name: "يوسف" }), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { user_id: "u-attendant", status: "active", login: null });
  assert.deepEqual(calls.created, ["attendant-0f0f@noemail.fuelos.app"]);
  assert.equal(calls.invites.length, 0);
});

test("an account already in use is added without a link", async () => {
  const { deps, calls } = fakeDeps({ findUserByEmail: async () => "u-existing" });
  const r = await handle(post({ station_id: STATION, role: "accountant", display_name: "ليلى", email: "l@x.com" }), deps);
  assert.deepEqual(await r.json(), { user_id: "u-existing", status: "invited", login: null });
  assert.equal(calls.invites.length, 0);
});

test("someone already on the team is refused", async () => {
  const { deps } = fakeDeps({ findUserByEmail: async () => "u-existing", memberStatus: async () => "active" });
  const r = await handle(post({ station_id: STATION, role: "accountant", display_name: "ليلى", email: "l@x.com" }), deps);
  assert.equal(r.status, 409);
  assert.equal(await code(r), "FUELOS_ALREADY_MEMBER");
});

test("inviting someone still 'invited' returns a fresh link and adds nothing", async () => {
  const { deps, calls } = fakeDeps({
    findUserByEmail: async () => "u-existing", memberStatus: async () => "invited",
    loginLinkFor: async () => ({ login: { token_hash: "th-fresh", type: "invite" } }),
  });
  const r = await handle(post({ station_id: STATION, role: "accountant", display_name: "ليلى", email: "l@x.com" }), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { user_id: "u-existing", status: "invited", login: { token_hash: "th-fresh", type: "invite" } });
  assert.equal(calls.members.length, 0);
});

test("asking again for someone who already signed in gives no link (no way into an account in use)", async () => {
  const { deps, calls } = fakeDeps({ findUserByEmail: async () => "u-existing", memberStatus: async () => "invited" });
  const r = await handle(post({ station_id: STATION, role: "accountant", display_name: "ليلى", email: "l@x.com" }), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { user_id: "u-existing", status: "invited", login: null });
  assert.equal(calls.members.length, 0);
});

test("a failed link is an internal error and adds nothing", async () => {
  const { deps, calls } = fakeDeps({ createInviteLink: async () => ({ error: "boom" }) });
  const r = await handle(post({ station_id: STATION, role: "accountant", display_name: "ليلى", email: "l@x.com" }), deps);
  assert.equal(r.status, 500);
  assert.equal(await code(r), "FUELOS_INTERNAL");
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
