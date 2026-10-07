// FuelOS — publish an Android release into the public `app-releases` bucket (called by GitHub Actions only).
// Spec: docs/superpowers/specs/2026-10-07-worker-android-capacitor-design.md
//
// Header  x-release-token: <plaintext token>   (its SHA-256 must be an unrevoked row of public.release_tokens)
// POST { action: "prepare", app: "worker", versionName }
//   → { path, exists: true }                     the APK of this version is already there (re-run): skip upload
//   → { path, exists: false, token, signedUrl }  upload the APK with storage.uploadToSignedUrl(path, token, …)
// POST { action: "publish", app: "worker", versionCode, versionName, notes? }
//   → the latest.json that was written
// Errors → { error: { code: "FUELOS_*", detail? } }
//
// Deploy with verify_jwt = false: the caller is CI, authenticated by the release token, not by a user session.
// The service role is used only here and only on the `app-releases` bucket.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const BUCKET = "app-releases";
const APPS = new Set(["worker"]);
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,6}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;

const STATUS: Record<string, number> = {
  FUELOS_BAD_REQUEST: 400,
  FUELOS_PERMISSION_DENIED: 401,
  FUELOS_NOT_FOUND: 409,
  FUELOS_INTERNAL: 500,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function fail(code: string, detail?: string): Response {
  return json({ error: detail ? { code, detail } : { code } }, STATUS[code] ?? 400);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function tokenIsValid(token: string | null): Promise<boolean> {
  if (!token || !TOKEN_RE.test(token)) return false;
  const { data, error } = await admin.from("release_tokens").select("id")
    .eq("token_hash", await sha256Hex(token)).is("revoked_at", null).maybeSingle();
  if (error) throw error;
  return data !== null;
}

function apkPath(app: string, versionName: string): string {
  return `${app}/fuelos-${app}-${versionName}.apk`;
}

async function objectExists(path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash);
  const file = path.slice(slash + 1);
  const { data, error } = await admin.storage.from(BUCKET).list(folder, { search: file, limit: 100 });
  if (error) throw error;
  return (data ?? []).some((o) => o.name === file);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return fail("FUELOS_BAD_REQUEST", "method");
  try {
    if (!(await tokenIsValid(req.headers.get("x-release-token")))) return fail("FUELOS_PERMISSION_DENIED");

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return fail("FUELOS_BAD_REQUEST", "json");
    }
    const { action, app, versionName } = body as { action?: unknown; app?: unknown; versionName?: unknown };
    if (typeof app !== "string" || !APPS.has(app)) return fail("FUELOS_BAD_REQUEST", "app");
    if (typeof versionName !== "string" || !VERSION_RE.test(versionName)) return fail("FUELOS_BAD_REQUEST", "versionName");
    const path = apkPath(app, versionName);

    if (action === "prepare") {
      if (await objectExists(path)) return json({ path, exists: true });
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw error ?? new Error("no signed url");
      return json({ path, exists: false, token: data.token, signedUrl: data.signedUrl });
    }

    if (action === "publish") {
      const versionCode = body.versionCode;
      const notes = body.notes ?? "";
      if (typeof versionCode !== "number" || !Number.isInteger(versionCode) || versionCode < 1) {
        return fail("FUELOS_BAD_REQUEST", "versionCode");
      }
      if (typeof notes !== "string" || notes.length > 500) return fail("FUELOS_BAD_REQUEST", "notes");
      if (!(await objectExists(path))) return fail("FUELOS_NOT_FOUND", "apk");
      const latest = {
        versionCode,
        versionName,
        apkUrl: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
        publishedAt: new Date().toISOString(),
        notes,
      };
      const { error } = await admin.storage.from(BUCKET).upload(`${app}/latest.json`,
        new Blob([JSON.stringify(latest)], { type: "application/json" }),
        { upsert: true, contentType: "application/json", cacheControl: "60" });
      if (error) throw error;
      return json(latest);
    }

    return fail("FUELOS_BAD_REQUEST", "action");
  } catch (e) {
    console.error("release-upload failed", e instanceof Error ? e.message : String(e));
    return fail("FUELOS_INTERNAL");
  }
});
