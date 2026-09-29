// Unit tests for the onboarding handler (no network): node --test supabase/functions/onboard-station/handler.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { handle, type Deps, type Login, type StationInput } from "./handler.ts";

const ADMIN = "11111111-0000-4000-8000-000000000007";
const STATION = "7d7a5f0e-0000-4000-8000-000000000001";
const PLAN = "5a5a5a5a-0000-4000-8000-000000000001";
const LINK: Login = { token_hash: "th-new", type: "invite" };

function fakeDeps(over: Partial<Deps> = {}) {
  const calls = { stations: [] as StationInput[], invites: [] as string[] };
  const deps: Deps = {
    callerIsPlatformAdmin: async (jwt) => (jwt === "admin-jwt" ? { userId: ADMIN } : { error: "forbidden" }),
    findUserByEmail: async () => null,
    createInviteLink: async (email) => { calls.invites.push(email); return { userId: "u-owner", login: LINK }; },
    loginLinkFor: async () => ({ error: "already_active" }),
    createStation: async (_actor, input) => { calls.stations.push(input); return { organization_id: "org-1", station_id: "st-1" }; },
    stationOwner: async () => "u-owner",
    ...over,
  };
  return { deps, calls };
}
function post(body: unknown, jwt = "admin-jwt") {
  return new Request("http://x/onboard-station", {
    method: "POST", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
const code = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;
const create = { action: "create", station_name: " محطة الأمل ", owner_name: "مالك جديد", owner_email: "Owner@Example.com",
                 city: "حمص", plan_id: PLAN, lat: 34.73, lng: 36.71 };

test("only a platform admin can onboard", async () => {
  const { deps, calls } = fakeDeps();
  const r = await handle(post(create, "owner-jwt"), deps);
  assert.equal(r.status, 403);
  assert.equal(calls.invites.length + calls.stations.length, 0);
});

test("a new owner gets an account, the station and a join link", async () => {
  const { deps, calls } = fakeDeps();
  const r = await handle(post(create), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { organization_id: "org-1", station_id: "st-1", owner_user_id: "u-owner", login: LINK });
  assert.deepEqual(calls.invites, ["owner@example.com"]);
  assert.deepEqual(calls.stations, [{ owner: "u-owner", owner_name: "مالك جديد", station_name: "محطة الأمل", org_name: null,
    currency: "SYP", city: "حمص", plan_id: PLAN, trial_days: 14, lat: 34.73, lng: 36.71 }]);
});

test("an owner who already uses FuelOS gets the station but no link into his account", async () => {
  const { deps, calls } = fakeDeps({ findUserByEmail: async () => "u-existing" });
  const r = await handle(post(create), deps);
  assert.deepEqual(await r.json(), { organization_id: "org-1", station_id: "st-1", owner_user_id: "u-existing", login: null });
  assert.equal(calls.invites.length, 0);
});

test("an account left over from a failed attempt (never signed in) gets a fresh link", async () => {
  const { deps } = fakeDeps({ findUserByEmail: async () => "u-orphan", loginLinkFor: async () => ({ login: LINK }) });
  const r = await handle(post(create), deps);
  assert.equal(((await r.json()) as { login: Login }).login.token_hash, "th-new");
});

test("an unknown plan is a 404 from the database", async () => {
  const { deps } = fakeDeps({ createStation: async () => { throw new Error("FUELOS_NOT_FOUND"); } });
  const r = await handle(post(create), deps);
  assert.equal(r.status, 404);
  assert.equal(await code(r), "FUELOS_NOT_FOUND");
});

test("bad input is refused before any account is created", async () => {
  const { deps, calls } = fakeDeps();
  for (const body of [
    { ...create, action: "delete" },
    { ...create, station_name: " " },
    { ...create, owner_name: undefined },
    { ...create, owner_email: "nope" },
    { ...create, currency: "syria" },
    { ...create, plan_id: "basic" },
    { ...create, trial_days: 400 },
    { ...create, lat: 34.7, lng: undefined },
    { ...create, lat: 99, lng: 36 },
  ]) {
    const r = await handle(post(body), deps);
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.equal(calls.invites.length + calls.stations.length, 0);
});

test("a fresh link for an owner who never signed in", async () => {
  const { deps } = fakeDeps({ loginLinkFor: async () => ({ login: LINK }) });
  const r = await handle(post({ action: "link", station_id: STATION }), deps);
  assert.deepEqual(await r.json(), { owner_user_id: "u-owner", login: LINK });
});

test("no link once the owner has signed in", async () => {
  const { deps } = fakeDeps();
  const r = await handle(post({ action: "link", station_id: STATION }), deps);
  assert.equal(r.status, 409);
  assert.equal(await code(r), "FUELOS_ALREADY_ACTIVE");
});

test("a link request is also admin-only", async () => {
  const { deps } = fakeDeps({ loginLinkFor: async () => ({ login: LINK }) });
  const r = await handle(post({ action: "link", station_id: STATION }, "owner-jwt"), deps);
  assert.equal(r.status, 403);
});
