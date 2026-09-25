# Brief 01 — Worker app as a Next.js PWA

Decided with the owner on 2026-09-26. Read `CLAUDE.md` and the five skills first. Talk to the user in Arabic, in short steps; he is not a developer.

## Decision (replaces Flutter)
- The **worker app** is a **Next.js PWA**: installable from the browser, and it works offline. The **customer app** will most likely follow the same path later.
- Why: the owner works on Windows with no Mac, and large command-line downloads stall on his network (the Claude Code binary and big npm tarballs both hung). Node.js is already installed, and one stack (TypeScript/React) serves every interface.
- Store builds come **later**: wrap the PWA with **Capacitor** and build it in the cloud (Codemagic or GitHub Actions). Never install Android Studio locally.
- Database and Edge Function changes go through **Claude in Cowork**, which has the Supabase connection. **Do not edit `supabase/migrations`**; tell the user what to relay instead.

## Step 0 — align the docs (one small commit)
- **`CLAUDE.md`**: update the stack, the layout below, the commands and the milestones. Remove Flutter/drift/Dart, and add a "Decisions" line for this change.
- **`.claude/skills/fuelos-offline-sync`**: keep every rule (client UUIDs, FIFO outbox, idempotent RPCs, 50-op limit, error → Arabic map, never delete outbox rows). Change only the implementation:
  - IndexedDB via **Dexie** for the outbox and reference data.
  - A service worker via **Serwist** for the app shell.
  - Call `navigator.storage.persist()`.
  - Sync on the `online` event, on window focus and every 30 s while open. iOS has no Background Sync, so sync only while the app is open.
  - The error map lives in `packages/core/src/errors.ts`.
- **`.claude/skills/fuelos-design-system`**: Tailwind preset generated from `design/tokens.json`, React components in `packages/ui`, Cairo via `next/font`, numbers via `Intl.NumberFormat('en-US')` (Latin digits).
- **`README.md`**: remove the Flutter steps.

## Step 1 — scaffold (npm workspaces; npm only, no pnpm/yarn)
```
package.json            workspaces: ["apps/*", "packages/*"]
apps/worker/            Next.js App Router + TypeScript + Tailwind, PWA manifest + service worker
packages/ui/            tokens preset + components: Button (md 40 / lg 56), Input (lg 64), Status Badge,
                        Sync Indicator, Alert Banner   (see design/screens/*.png)
packages/core/          supabase client factory, errors.ts (FUELOS_* → Arabic), number/money format
```
- `apps/worker`:
  - Set `<html lang="ar" dir="rtl">` and use the Cairo font.
  - Content is at most 390 px wide, centred on desktop screens.
  - Manifest: name «FuelOS — العامل», `theme_color` #0F766E, `display: standalone`, simple icons.
- **If `npm install` hangs on one large package, stop after about 3 minutes and tell the user.** Do not retry in a loop. Workaround: he downloads that package's `.tgz` in the browser, then you run `npm install <path-to>.tgz`.

## Step 2 — first vertical slice: L2 «دخول العامل (PIN)»
Match `design/screens/L2.png`.

**Env (`apps/worker/.env.local`, never committed):**
```
NEXT_PUBLIC_SUPABASE_URL=https://mpjcgarblfixceakyaxy.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_0p7g3lnbDLjO5gzvWMseyQ_2ACm3GzH
```
The publishable key is public by design, and RLS protects the data.

**Device setup (dev):**
- Add a screen at `/setup` with two fields, *device id* and *device secret*. Save both on the device (IndexedDB) and never log them.
- The user has the dev values from the Cowork chat (`cowork-test-device` plus a 64-hex secret). He pastes them once.
- In production this screen is replaced by: owner or manager signs in with OTP → `issue_device_credential()`. That is a later slice.

**Flow:**
1. **Roster:** POST `{action:"roster", device_id, device_secret}` to `https://mpjcgarblfixceakyaxy.supabase.co/functions/v1/attendant-pin-login`, with headers `apikey` and `Content-Type: application/json`. Show «من أنت؟» as a list of large name buttons.
2. **PIN:** big numeric keypad (4–6 digits, keys ≥ 56 px), matching L2.png. Send `{action:"login", …, user_id, pin}`.
3. **Success:** `supabase.auth.setSession({access_token, refresh_token})`, then go to a placeholder `/shift/start` that says «مرحباً <الاسم>» and shows the Sync Indicator.
4. **Errors (Arabic, never the raw code):**
   | Code | Message |
   |---|---|
   | `FUELOS_PIN_INVALID` | «الرمز غير صحيح — بقيت {attempts_left} محاولات» |
   | `FUELOS_PIN_LOCKED` | «تم إيقاف الدخول مؤقتاً حتى {HH:MM}» (from `locked_until`) |
   | `FUELOS_DEVICE_NOT_REGISTERED` | «هذا الجهاز غير مسجّل لمحطة — اطلب من المدير تسجيله» |
   | `FUELOS_PIN_NOT_SET` | «لم يُحدَّد لك رمز بعد — اطلب من صاحب المحطة» |
   | `FUELOS_PIN_LOGIN_UNAVAILABLE` / `FUELOS_INTERNAL` | «تعذّر الدخول الآن — حاول بعد قليل» |
   | network error | «لا يوجد اتصال — الدخول يحتاج إنترنت أول مرة» |
5. **States:** loading (skeleton), error, offline.

**Test account:** خالد العمر, PIN **4821**.

## Step 3 — run and show the user
- Start the app with `npm run dev -w apps/worker`, then have the user open `http://localhost:3000/setup` in Chrome.
- To view it as a phone: `Ctrl+Shift+M` in DevTools, choose a 390 px wide device.
- Phone testing over HTTPS (Vercel) is a later step.

## Done when
- `npm run build` and lint pass.
- The user logs in as خالد with 4821 and sees his name.
- A wrong PIN shows the remaining attempts.
- Committed and pushed to GitHub, with a short Arabic summary for the user.
