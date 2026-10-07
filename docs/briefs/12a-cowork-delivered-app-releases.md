# 12a — Delivered by Cowork: Android release storage + `release-upload` (plan Tasks C1–C2)

Plan: `docs/superpowers/plans/2026-10-07-worker-android-capacitor.md` · Spec: `docs/superpowers/specs/2026-10-07-worker-android-capacitor-design.md`.
Deployed to the live project on 2026-10-07. **Do not edit these files** — DB / Edge Function changes go through Cowork.

## C1 — `supabase/migrations/20261007000100_app_releases.sql` (+ `supabase/tests/95_app_releases_test.sql`, passes locally)
- Bucket **`app-releases`**: public read, 100 MB, MIME `application/vnd.android.package-archive` + `application/json`. No write policy for any API role.
- Public URLs:
  - `https://mpjcgarblfixceakyaxy.supabase.co/storage/v1/object/public/app-releases/worker/latest.json`
  - `https://mpjcgarblfixceakyaxy.supabase.co/storage/v1/object/public/app-releases/worker/fuelos-worker-<versionName>.apk`
- Table `release_tokens` (SHA-256 of CI tokens): service role only. One active token, label `github-actions-worker`. The user holds the plaintext and puts it in the GitHub secret **`RELEASE_UPLOAD_TOKEN`** — never ask for it, never print it.

## C2 — Edge Function `release-upload` (`supabase/functions/release-upload/index.ts`, verify_jwt = false)
`POST https://mpjcgarblfixceakyaxy.supabase.co/functions/v1/release-upload`, header `x-release-token: $RELEASE_UPLOAD_TOKEN`, JSON body.

| Request | Response |
|---|---|
| `{"action":"prepare","app":"worker","versionName":"1.0.12"}` | `200 {"path":"worker/fuelos-worker-1.0.12.apk","exists":false,"token":"…","signedUrl":"…"}` |
| same, when that APK is already uploaded (re-run of the same workflow run) | `200 {"path":"…","exists":true}` → skip the upload, go to publish |
| `{"action":"publish","app":"worker","versionCode":12,"versionName":"1.0.12","notes":""}` | `200` = the `latest.json` written: `{versionCode, versionName, apkUrl, publishedAt, notes}` |

Errors: `{ "error": { "code": "FUELOS_*", "detail"?: "…" } }`
- `401 FUELOS_PERMISSION_DENIED` — missing / wrong / revoked token.
- `400 FUELOS_BAD_REQUEST` with `detail` `json | app | versionName | versionCode | notes | action | method` (`versionName` must match `^\d{1,4}\.\d{1,4}\.\d{1,6}$`; `notes` ≤ 500 chars).
- `409 FUELOS_NOT_FOUND` (`detail: "apk"`) — publish before the APK is uploaded.
- `500 FUELOS_INTERNAL`.

Upload in `publish-release.mjs` with supabase-js (publishable key client is fine — the signed token authorises the write):
`supabase.storage.from("app-releases").uploadToSignedUrl(path, token, buffer, { contentType: "application/vnd.android.package-archive" })`.

## Not verified from Cowork (no outbound HTTP from here) — check in Task 6
- [ ] `curl -s -X POST <url> -H "x-release-token: wrong" -d '{}'` → `401 FUELOS_PERMISSION_DENIED` (safe to run locally; needs no real token).
- [ ] First green workflow run: `latest.json` publicly readable, `apkUrl` downloads the APK.
If either fails, send Cowork the HTTP status and body (never the token).
