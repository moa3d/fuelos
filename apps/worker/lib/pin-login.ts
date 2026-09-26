// Client for the Edge Function `attendant-pin-login` (supabase/functions/attendant-pin-login).
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

export type RosterMember = { user_id: string; display_name: string; role: "attendant" | "shift_manager" };
export type Roster = { station: { id: string; name: string }; members: RosterMember[] };
export type LoginSession = { access_token: string; refresh_token: string; expires_at: number; expires_in: number };
export type LoginOk = { session: LoginSession; user_id: string; station_id: string };
export type ApiError = { code: string; [detail: string]: unknown };
export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Thrown when the request never completed (no internet, or no answer within the timeout). */
export class NetworkError extends Error {}

const TIMEOUT_MS = 15_000;

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError");
}

async function call<T>(body: Record<string, unknown>): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/attendant-pin-login`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new NetworkError("offline"); // TypeError (no network), AbortError, TimeoutError
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch (e) {
    if (isAbort(e)) throw new NetworkError("timeout");
    return { ok: false, error: { code: "FUELOS_INTERNAL" } };
  }
  const err = (json as { error?: ApiError })?.error;
  if (!res.ok || err) return { ok: false, error: err ?? { code: "FUELOS_INTERNAL" } };
  return { ok: true, data: json as T };
}

export function fetchRoster(deviceId: string, deviceSecret: string): Promise<Result<Roster>> {
  return call<Roster>({ action: "roster", device_id: deviceId, device_secret: deviceSecret });
}

export function pinLogin(deviceId: string, deviceSecret: string, userId: string, pin: string): Promise<Result<LoginOk>> {
  return call<LoginOk>({ action: "login", device_id: deviceId, device_secret: deviceSecret, user_id: userId, pin });
}
