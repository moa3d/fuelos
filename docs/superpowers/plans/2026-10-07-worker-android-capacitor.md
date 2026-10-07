# Worker Android App (Capacitor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `apps/worker` as a signed Android APK (Capacitor) with native camera, QR scanning, encrypted device-secret storage, keep-awake, an in-app update notice and a download page — while the Vercel web build keeps behaving exactly as today.

**Architecture:** One Next.js codebase, two build targets: the existing web build (Serwist PWA) and a `FUELOS_TARGET=native` static export that Capacitor wraps. Every native call lives behind `apps/worker/lib/native/`, whose web fallback is today's behaviour. GitHub Actions builds and signs the APK; a Cowork-owned Edge Function hands out a signed upload URL into the public `app-releases` bucket and writes `worker/latest.json`.

**Tech Stack:** Next.js 16 (App Router, `output: "export"`), Capacitor 8 (`@capacitor/core|cli|android|app|camera`), `@capacitor-mlkit/barcode-scanning`, `@capacitor-community/keep-awake`, `@aparajita/capacitor-secure-storage`, `qrcode`, Dexie (unchanged), GitHub Actions (Node 22, JDK 21), Supabase Storage + Edge Function.

**Spec:** `docs/superpowers/specs/2026-10-07-worker-android-capacitor-design.md` (Arabic). Read it, plus `CLAUDE.md` and `.claude/skills/fuelos-offline-sync`, before Task 1.

## Global Constraints
- Talk to the user in Arabic, short steps; he is not a developer. All UI copy is Arabic RTL with Latin digits.
- Never create or edit files in `supabase/migrations` or `supabase/functions` — Tasks C1–C2 are Cowork's.
- Never commit the keystore, its passwords, `RELEASE_UPLOAD_TOKEN`, `.env*`, or any service-role key.
- Outbox rules from `fuelos-offline-sync` are untouched: client UUIDs, FIFO, never delete rows, 50-op limit.
- Web build (`npm run build`, Vercel) must behave exactly as before; `npm run lint` and `npm test` stay green after every task.
- Only files in `apps/worker/lib/native/` may import Capacitor plugins.
- Capacitor: latest stable 8.x; every plugin at the release matching that major. If a plugin has no release for the installed major, stop and report — do not downgrade Capacitor.
- `appId: "com.fuelos.worker"`, `appName: "FuelOS العامل"`, `webDir: "out"`, `minSdk 24`, `android.minWebViewVersion: 111`, `server.errorPath: "webview-outdated.html"`.
- Android: only the `CAMERA` permission added; `android:allowBackup="false"`.
- `versionCode` = GitHub `run_number`; `versionName` = `1.0.<run_number>`.
- Device QR payload: `{"t":"fuelos-device","v":1,"id":"<device_id>","s":"<64-hex secret>"}`.
- `latest.json`: `{"versionCode":N,"versionName":"1.0.N","apkUrl":"…","publishedAt":"<ISO>","notes":"…"}` at `app-releases/worker/latest.json`; APKs at `app-releases/worker/fuelos-worker-<versionName>.apk`.
- Update check: at most once per 6 h, only online, never blocking, failures silent.
- Node 22+ locally and in CI (Capacitor 8 CLI requires it). If `node -v` < 22, ask the user to install Node 22 LTS first.

## Review Focus
1. **WebView older than Chrome 111** (Tailwind 4 needs it): the phone must show the Arabic «حدّث Android System WebView» page, not a blank screen → Task 2 config check + Task 7 note.
2. **Reload / Android back into a deep route** (`/shift/move/`) in the static build: page must load, never a 404 → Task 2 verifies `out/shift/move/index.html` exists and `trailingSlash: true`.
3. **Installing a newer APK over the old one with unsent sales**: device, session and outbox survive (same signing key) → Task 6 keystore is stable across runs; Task 7 checklist step 8.
4. **Phone without Google Play services** (e.g. Huawei): scanning reports «المسح غير متاح على هذا الهاتف — اكتب الرمز» and manual entry still works → Task 1 `scanCode` returns `{ ok:false, reason:"unavailable" }`; Task 3/4 show the message; Task 7 notes it.
5. **Camera permission denied or capture cancelled**: no crash, no error on cancel, the shift continues without a photo → Task 1 `takeMeterPhoto` returns `null` on cancel and throws `PermissionDeniedError` on denial; Task 4 maps it to «اسمح للتطبيق باستخدام الكاميرا من الإعدادات».

---

## Cowork tasks (done by Cowork in Supabase — not by Claude Code)

### Task C1: `app-releases` bucket and release-token table
- Migration `supabase/migrations/20261007000100_app_releases.sql`:
  - Bucket `app-releases`: `public = true`, `file_size_limit = 104857600`, `allowed_mime_types = {application/vnd.android.package-archive, application/json}`. No `storage.objects` write policies for `anon`/`authenticated`.
  - Table `public.release_tokens(id uuid pk default gen_random_uuid(), label text not null, token_hash text not null unique, created_at timestamptz default now(), revoked_at timestamptz)`, RLS on, no policies, `revoke all … from public, anon, authenticated`.
- Local PG test `supabase/tests/95_app_releases_test.sql`: anon/authenticated cannot read `release_tokens`; cannot insert into `storage.objects` for `app-releases`.
- Deploy; generate one 32-byte hex token, store only its SHA-256 hex in `release_tokens` (label `github-actions-worker`), give the plaintext to the user once for the GitHub secret `RELEASE_UPLOAD_TOKEN`.

### Task C2: Edge Function `release-upload`
- `POST` with header `x-release-token`; SHA-256 of it must match an unrevoked `release_tokens.token_hash`, else `401 {"error":{"code":"FUELOS_PERMISSION_DENIED"}}`.
- Body validation: `app === "worker"`; `versionName` matches `^\d+\.\d+\.\d+$`; `versionCode` positive integer (publish only); `notes` ≤ 500 chars. Else `400 FUELOS_BAD_REQUEST`.
- `{"action":"prepare","app","versionName"}` → `{ path, token, signedUrl }` from `createSignedUploadUrl("worker/fuelos-worker-<versionName>.apk")` (no upsert).
- `{"action":"publish","app","versionCode","versionName","notes"}` → verifies the APK object exists (else `409 FUELOS_NOT_FOUND`), uploads `worker/latest.json` with `upsert: true`, `cacheControl: "60"`, `apkUrl` = public URL; returns the JSON written.
- Uses the service role only inside the function; touches only the `app-releases` bucket.
- Verified with curl: wrong token → 401; prepare → signed URL; publish before upload → 409.

---

## Claude Code tasks

### Task 1: Platform layer `lib/native/` and shared device-QR format

**Files:**
- Create: `packages/core/src/device-qr.ts`, `packages/core/src/device-qr.test.ts`
- Modify: `packages/core/src/index.ts` (export), `packages/core/package.json` (add `"test": "node --test \"src/*.test.ts\""` if absent)
- Create: `apps/worker/lib/native/platform.ts`, `version.ts`, `version.test.ts`, `camera.ts`, `scan.ts`, `secure-store.ts`, `app-shell.ts`, `index.ts`
- Modify: `apps/worker/package.json` (Capacitor deps; `"test": "node --test \"lib/*.test.ts\" \"lib/native/*.test.ts\""`)

**Interfaces:**
- Produces (`@fuelos/core`): `buildDeviceQr(deviceId: string, secret: string): string`; `parseDeviceQr(raw: string): { ok: true; deviceId: string; secret: string } | { ok: false }`.
- Produces (`@/lib/native`):
  - `isNative(): boolean`
  - `isNewer(latest: number, installed: number | null): boolean`
  - `takeMeterPhoto(): Promise<File | null>` — native only; `null` on cancel; throws `PermissionDeniedError` (exported class) on denial. Back camera, JPEG, quality 70, max side 1600 px, file name `meter.jpg`, type `image/jpeg`.
  - `scanCode(): Promise<{ ok: true; text: string } | { ok: false; reason: "cancelled" | "unavailable" | "denied" }>` — uses `scan()` only when `isGoogleBarcodeScannerModuleAvailable()`; QR format only.
  - `secureStore: { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> }` — native only.
  - `keepAwake(on: boolean): Promise<void>` (no-op on web), `onResume(cb: () => void): () => void`, `onBackButton(handler: (canGoBack: boolean) => void): () => void`, `minimizeApp(): Promise<void>`, `appBuild(): Promise<number | null>` (web → `null`), `openExternal(url: string): Promise<void>` (system browser; web → `window.open(url, "_blank")`).

- [ ] **Step 1: Write failing tests** `packages/core/src/device-qr.test.ts`:
  - `parseDeviceQr(buildDeviceQr("dev-1", "a".repeat(64)))` → `{ ok:true, deviceId:"dev-1", secret:"a".repeat(64) }`
  - uppercase hex secret is accepted and returned lower-case
  - rejects: non-JSON `"hello"`, `{"t":"other",…}`, `"v":2`, secret of 63 chars, non-hex secret, empty `id` → each `{ ok:false }`
  - `apps/worker/lib/native/version.test.ts`: `isNewer(5, 4)` true; `isNewer(4, 4)` false; `isNewer(3, 4)` false; `isNewer(5, null)` false (web never shows the banner).
- [ ] **Step 2:** `npm test -w packages/core` and `npm test -w apps/worker` → FAIL (modules missing).
- [ ] **Step 3:** Install deps in `apps/worker` (`@capacitor/core @capacitor/app @capacitor/camera @capacitor-mlkit/barcode-scanning @capacitor-community/keep-awake @aparajita/capacitor-secure-storage`, dev: `@capacitor/cli @capacitor/android`). Implement the modules above; `isNative()` = `typeof window !== "undefined" && Capacitor.isNativePlatform()`.
- [ ] **Step 4:** Both test commands PASS; `npm run lint -w apps/worker` and `npm run build -w apps/worker` PASS.
- [ ] **Step 5: Commit** `feat(worker): native platform layer and device QR format`

### Task 2: Native build target and Capacitor Android project

**Files:**
- Modify: `apps/worker/next.config.ts`, `apps/worker/package.json` (dev dep `cross-env`; script `"build:native": "cross-env FUELOS_TARGET=native next build --webpack"` — works on Windows and in CI)
- Create: `apps/worker/capacitor.config.ts`, `apps/worker/public/webview-outdated.html`, `apps/worker/android/**` (via `npx cap add android`), `apps/worker/resources/icon.png` (from `public/icons/icon-512.png`)
- Modify: `apps/worker/android/app/src/main/AndroidManifest.xml`, `apps/worker/android/app/build.gradle`, `apps/worker/android/variables.gradle` if needed

**Interfaces:**
- Produces: `npm run build:native -w apps/worker` → `apps/worker/out/` (static); Gradle reads env `FUELOS_VERSION_CODE` (default `1`), `FUELOS_VERSION_NAME` (default `"1.0.0"`), `FUELOS_KEYSTORE_PATH`, `FUELOS_KEYSTORE_PASSWORD`, `FUELOS_KEY_ALIAS`, `FUELOS_KEY_PASSWORD`; release signing config uses `storeType "pkcs12"` and is applied only when `FUELOS_KEYSTORE_PATH` is set.

- [ ] **Step 1:** In `next.config.ts`, when `process.env.FUELOS_TARGET === "native"`: `output: "export"`, `images: { unoptimized: true }`, `trailingSlash: true`, and do not wrap with Serwist. Otherwise unchanged. If `app/manifest.ts` blocks the export, add `export const dynamic = "force-static"`.
- [ ] **Step 2:** `public/webview-outdated.html`: standalone RTL page (no JS, inline CSS, Cairo/system font) with «حدّث تطبيق Android System WebView من Google Play ثم أعد فتح التطبيق».
- [ ] **Step 3:** `capacitor.config.ts` with the Global Constraints values; `npx cap add android`; manifest `CAMERA` + `allowBackup="false"`; Gradle signing/version from env; icons via `npx @capacitor/assets generate --android`.
- [ ] **Step 4: Verify**
  - `npm run build:native -w apps/worker` succeeds; `out/index.html`, `out/setup/index.html`, `out/shift/move/index.html`, `out/webview-outdated.html` exist; `out/sw.js` does **not** exist.
  - `npx cap sync android` (in `apps/worker`) succeeds without an Android SDK.
  - `npm run build -w apps/worker` still emits `public/sw.js` (web unchanged).
- [ ] **Step 5: Commit** `feat(worker): Capacitor Android project and native static build`

### Task 3: Device setup by QR (worker) and QR in owner-web

**Files:**
- Modify: `apps/worker/lib/db.ts` (`getDevice`, `saveDevice`), `apps/worker/app/setup/page.tsx`
- Modify: `apps/owner-web/app/(app)/settings/page.tsx` (`NewSecretPanel`), `apps/owner-web/package.json` (`qrcode`, `@types/qrcode`)

**Interfaces:**
- Consumes: `parseDeviceQr`, `buildDeviceQr` (`@fuelos/core`); `isNative`, `scanCode`, `secureStore` (`@/lib/native`).
- Produces: `getDevice()` / `saveDevice(deviceId, secret)` keep their signatures; on native they read/write secure-store keys `fuelos.device.id`, `fuelos.device.secret`, `fuelos.device.savedAt` instead of Dexie (no migration: native installs start empty).

- [ ] **Step 1:** `db.ts`: branch on `isNative()`; web path unchanged.
- [ ] **Step 2:** `/setup` on native: primary `Button` «امسح رمز الجهاز» → `scanCode()` → `parseDeviceQr` → `saveDevice` → `router.replace("/")`. Invalid → «هذا ليس رمز تسجيل جهاز FuelOS»; `unavailable` → «المسح غير متاح على هذا الهاتف — اكتب الرمز»; `denied` → «اسمح للتطبيق باستخدام الكاميرا من الإعدادات»; `cancelled` → nothing. Manual form stays below as «أو أدخل البيانات يدوياً». Web: page unchanged.
- [ ] **Step 3:** owner-web `NewSecretPanel`: render `QRCode.toDataURL(buildDeviceQr(deviceId, secret), { width: 220, margin: 1 })` beside the text fields with caption «امسحه من تطبيق العامل»; the data URL lives only in component state (never stored, never logged).
- [ ] **Step 4: Verify** lint/test/build for `apps/worker` and `apps/owner-web` PASS; in owner-web dev, issuing a credential shows the QR once and it disappears on «تم».
- [ ] **Step 5: Commit** `feat: register a worker device by scanning a QR`

### Task 4: Camera, card scan, keep-awake, resume sync, back button, safe areas

**Files:**
- Create: `apps/worker/app/native-shell.tsx`
- Modify: `apps/worker/app/layout.tsx`, `apps/worker/app/shift-parts.tsx` (`MeterPhotoCard`), `apps/worker/app/shift/page.tsx` (`CustomerLinkCard`), `apps/worker/app/sync-runner.tsx`, `apps/worker/app/globals.css`

**Interfaces:**
- Consumes: Task 1 native API; `db.shift` (Dexie) and `liveQuery` from `dexie`.
- Produces: `<NativeShell />` (renders nothing on web) mounted in `layout.tsx` beside `<SyncRunner />`.

- [ ] **Step 1:** `MeterPhotoCard`: on native, «إضافة»/«تغيير» call `takeMeterPhoto()`; a `File` goes to the existing `pick(file)`; `null` → nothing; `PermissionDeniedError` → error text «اسمح للتطبيق باستخدام الكاميرا من الإعدادات». Web keeps the `<input type="file">`.
- [ ] **Step 2:** `CustomerLinkCard` (open state, online): on native add `Button` «امسح بطاقة الزبون» → `scanCode()` → put `text` in `query` and run `search()`; `unavailable`/`denied` messages as in Task 3; manual input stays.
- [ ] **Step 3:** `NativeShell`:
  - keep-awake: subscribe with `liveQuery` to `db.shift` rows; `keepAwake(true)` while any row has `status === "open"`, else `keepAwake(false)`.
  - back button: `onBackButton(canGoBack => canGoBack && location.pathname !== "/" ? history.back() : minimizeApp())`.
- [ ] **Step 4:** `SyncRunner`: also `kick()` on `onResume`.
- [ ] **Step 5:** Safe areas: content and headers never sit under the status/navigation bar on an edge-to-edge Android 15 phone (use `env(safe-area-inset-*)` already in use; add bottom inset to `StickyAction`).
- [ ] **Step 6: Verify** lint/test/web build PASS; `build:native` + `cap sync` PASS.
- [ ] **Step 7: Commit** `feat(worker): native camera, card scan, keep-awake and back button`

### Task 5: Update notice and download page

**Files:**
- Create: `apps/worker/lib/release.ts`, `apps/worker/lib/release.test.ts`, `apps/worker/app/update-banner.tsx`, `apps/worker/app/download/page.tsx`
- Modify: `apps/worker/app/layout.tsx`, `apps/worker/package.json` (`qrcode`, `@types/qrcode`)

**Interfaces:**
- Consumes: `isNewer`, `appBuild`, `openExternal`, `onResume`, `isNative` (Task 1); `unsentCount` (`lib/outbox.ts`); `SUPABASE_URL` (`lib/env.ts`).
- Produces: `LATEST_URL = \`${SUPABASE_URL}/storage/v1/object/public/app-releases/worker/latest.json\``; `parseLatest(json: unknown): Latest | null` where `Latest = { versionCode: number; versionName: string; apkUrl: string; publishedAt: string; notes: string }`; `shouldCheck(lastCheckedAt: number | null, now: number): boolean` (true when null or ≥ 6 h).

- [ ] **Step 1: Failing tests** `release.test.ts`: `parseLatest` accepts the Global-Constraints shape; returns `null` for missing `apkUrl`, non-integer `versionCode`, non-`https:` `apkUrl`; `shouldCheck(null, t)` true, `shouldCheck(t, t + 5.9h)` false, `shouldCheck(t, t + 6h)` true.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `release.ts`. **Step 4:** Run → PASS.
- [ ] **Step 5:** `UpdateBanner` (native only, mounted in layout): on start and `onResume`, if online and `shouldCheck(localStorage "fuelos.update.checkedAt")`, fetch `LATEST_URL` (`cache: "no-store"`, 10 s timeout); if `isNewer(latest.versionCode, await appBuild())` show a non-blocking bar «نسخة جديدة متوفرة (1.0.N)» + `Button` «تحديث» → `openExternal(apkUrl)`. If `unsentCount(me) > 0` add «عملياتك المحفوظة تبقى بعد التحديث — ثبّت فوق التطبيق الحالي ولا تحذفه». Any failure: render nothing.
- [ ] **Step 6:** `/download` page (web): reads `LATEST_URL`; shows version, «تحميل التطبيق» (link to `apkUrl`), QR of `https://fuelos-worker.vercel.app/download/` via `qrcode`, and three steps: «اسمح بالتثبيت من هذا المصدر عند السؤال» → «افتح الملف وثبّته» → «عند التحديث ثبّت فوق التطبيق الحالي ولا تحذفه حتى لا تضيع العمليات المحفوظة». States: loading, «لا توجد نسخة منشورة بعد», network error with retry.
- [ ] **Step 7: Verify** lint/test/web build/native build PASS. **Step 8: Commit** `feat(worker): update notice and APK download page`

### Task 6: Signing key, CI build and release publishing

**Files:**
- Create: `apps/worker/scripts/make-keystore.mjs`, `apps/worker/scripts/publish-release.mjs`, `.github/workflows/worker-android.yml`, `docs/android-release.md` (Arabic)
- Modify: `apps/worker/package.json` (dev dep `node-forge`), `CLAUDE.md` (Decisions + commands), `.gitignore` (`*.p12`, `*.jks`, `fuelos-keys/`)

**Interfaces:**
- Consumes: Gradle env from Task 2; Edge Function `release-upload` (Task C2) at `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/release-upload` with header `x-release-token`.
- Produces: GitHub secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `RELEASE_UPLOAD_TOKEN`; variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

- [ ] **Step 1:** `make-keystore.mjs`: RSA 2048, self-signed cert CN=FuelOS Worker valid 30 years, PKCS12 (alias `fuelos-worker`, key password = store password, random 24-char password). Writes `%USERPROFILE%\fuelos-keys\fuelos-worker.p12` and `github-secrets.txt` (the four values, keystore as base64) **outside the repo**; refuses to overwrite an existing keystore. Run it once; guide the user in Arabic to paste the values into GitHub → Settings → Secrets and variables → Actions, and to copy the `fuelos-keys` folder to a USB/cloud backup.
- [ ] **Step 2:** `publish-release.mjs <apkPath> <versionCode> <versionName>`: `prepare` → `supabase.storage.from("app-releases").uploadToSignedUrl(path, token, buffer, { contentType: "application/vnd.android.package-archive" })` → `publish`. Exits non-zero with the server's error code on any failure; never prints the token.
- [ ] **Step 3:** `worker-android.yml`: triggers `workflow_dispatch` and tags `worker-v*`; Node 22, `npm ci`, `npm run lint -w apps/worker`, `npm test -w apps/worker`, `npm run build:native -w apps/worker` (with the two `NEXT_PUBLIC_*` vars), `npx cap sync android`, JDK 21 (`actions/setup-java`, temurin), decode keystore to `$RUNNER_TEMP/fuelos-worker.p12`, `./gradlew assembleRelease` with the `FUELOS_*` env (`FUELOS_VERSION_CODE=${{ github.run_number }}`, `FUELOS_VERSION_NAME=1.0.${{ github.run_number }}`), upload the APK as a workflow artifact, then `node apps/worker/scripts/publish-release.mjs`.
- [ ] **Step 4:** `docs/android-release.md` (Arabic): how to release (Actions → worker-android → Run workflow), where the APK appears, the backup rule for the keystore, and «ثبّت فوق القديم ولا تحذفه».
- [ ] **Step 5: Verify** first workflow run is green; `latest.json` is publicly readable; the `/download` page shows version `1.0.<run>`.
- [ ] **Step 6: Commit** `ci(worker): signed Android build and release publishing`

### Task 7: Acceptance on a real phone (with the user)
- [ ] Walk the user through the spec's 8-step checklist in Arabic, one step at a time, collecting a screenshot per step.
- [ ] Also check: Review Focus 1 (ask the user for Settings → Apps → Android System WebView version if anything renders oddly) and 4 (if the phone lacks Google Play services, confirm manual entry works).
- [ ] Fix any failure in the task that owns it, re-run CI, repeat the failed step.
- [ ] Report to the user: what works, what was fixed, open issues. Merge to `main` only after the user says so.
