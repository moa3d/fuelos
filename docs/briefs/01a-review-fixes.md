# Brief 01a — fixes from the code review of brief 01 (before the first run)

Written by Claude in Cowork on 2026-09-26. An independent reviewer read the uncommitted worker-app code against brief 01. Every item below was checked against the code and against `design/screens/L2.png` before it went into this list. Talk to the user in Arabic, in short steps.

## Already done in Cowork (don't redo)
- **CORS on the Edge Function.** The browser's preflight got a 400 with no CORS headers, so every call from the app failed and showed «لا يوجد اتصال».
  - Fixed in `supabase/functions/attendant-pin-login/index.ts`: OPTIONS now returns 204, and every response carries `Access-Control-Allow-Origin: *`.
  - Deployed as **version 3**, with a red→green test in Cowork.
  - Any origin is allowed on purpose. The endpoint is authenticated by the device secret in the body, not by cookies.
- **New migration `supabase/migrations/20260926000100_pin_helpers_search_path.sql`.** Already applied on Supabase, 107 DB tests pass.
- Both files are in the folder. Include them in your next commit and don't edit them.

## Step A — install and check the CORS fix
1. Run `npm install` at the repo root. If it hangs on one package for more than about 3 minutes, stop and tell the user. Don't loop.
2. Preflight check from this computer. Expect `204` and `access-control-allow-origin: *`:
   ```
   curl.exe -i -X OPTIONS https://mpjcgarblfixceakyaxy.supabase.co/functions/v1/attendant-pin-login -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: apikey,content-type"
   ```

## Step B — must fix before the demo
1. **The keypad is mirrored.** `apps/worker/app/page.tsx`, the keypad grid.
   - L2.png has 1-2-3 left→right and backspace bottom-right.
   - Add `dir="ltr"` to the grid `<div>`. «دخول» then lands in the empty bottom-left slot and backspace goes bottom-right.
2. **The service worker must open the app offline.** `next.config.ts` and `app/sw.ts`.
   - Precache the pages with `additionalPrecacheEntries` for `/`, `/setup` and `/shift/start`, with the revision set to the build id or git SHA.
   - Add a document fallback, so an installed app opened offline shows the app's own offline state, not Chrome's page.
3. **Supabase responses must never be cached.** In `sw.ts`, put this first, before `...defaultCache`:
   `{ matcher: ({ url }) => url.hostname.endsWith(".supabase.co"), handler: new NetworkOnly() }`
   - Reason: `defaultCache` caches cross-origin GETs such as `/auth/v1/user`, keyed only by URL. On a shared phone that would serve one attendant's data to another.
   - After install, check the rule order in `node_modules/@serwist/next`.
4. **Set `reloadOnOnline: false`** in `withSerwistInit`. The default reloads the page on every reconnect, which wipes the PIN being typed and later the half-entered sales. The page already handles `online` itself.
5. **Add a fetch timeout.** In `lib/pin-login.ts`, add `signal: AbortSignal.timeout(15_000)` and map `AbortError` / `TimeoutError` to `NetworkError`.
6. **Offline «تبديل العامل» must sign the attendant out.** `app/shift/start/page.tsx` → `switchWorker()`.
   - `signOut({scope:"local"})` returns `{error}` on a network failure and keeps the session.
   - If `error` is set, remove the stored session yourself (the `sb-mpjcgarblfixceakyaxy-auth-token` localStorage key), then clear Dexie and navigate.
   - Verify with DevTools set to offline: after switching, `/shift/start` must redirect to `/`.

## Step C — small fixes, do them now while it's cheap
- **Outbox schema:** change it to `"++seq, &id, status"` (auto-increment FIFO) before any rows exist. Order by `seq`, never by the device clock.
- **Storage errors:** catch `getDevice()` / `saveDevice()` failures and show the error state, instead of an endless skeleton or «جارٍ الحفظ…».
- **Persistent storage:** call `navigator.storage.persist()` on app start, not only in `/setup`.
- **Disabled keypad** when no name is chosen: show «اختر اسمك أولاً» (rule: don't hide, explain).
- **`FUELOS_DEVICE_NOT_REGISTERED`:** the main action becomes «إعداد الجهاز» → `/setup`, not «إعادة المحاولة».
- **Copy on the login screen:**
  - «هذا الجهاز مسجّل في {station name}» (avoids «لالنور»).
  - Initials skip the «ال» article: خالد العمر → «خع».
  - If two people share a first name, show the full name.
- **Remaining attempts, with correct Arabic plural:**
  | Left | Text |
  |---|---|
  | 1 | «الرمز غير صحيح — بقيت محاولة واحدة» |
  | 2 | «الرمز غير صحيح — بقيت محاولتان» |
  | 3–10 | «الرمز غير صحيح — بقيت {n} محاولات» |
- **L2 footer:** replace «يعمل الدخول دون إنترنت على هذا الجهاز» with «الدخول يحتاج إنترنت». Offline PIN login is a later slice, so the screen must not promise it.
- **Error map (`packages/core/src/errors.ts`):**
  - Rename the login-only texts (`LOGIN_NETWORK_MESSAGE`, and a login-specific INTERNAL text) so S2 doesn't reuse them.
  - Add `FUELOS_PERMISSION_DENIED` / `42501` from the offline-sync skill.
  - A network failure inside `setSession` shows the network message.
- **`lib/env.ts`:** throw a clear error in development when the env values are missing.
- **iOS safe area:** pad with `env(safe-area-inset-top)` on every page, and make sure the status-bar text stays readable on the light pages.
- **`/setup` secret field:** a plain text field or textarea with autocomplete off, not `type="password"`, so Chrome won't sync it to the password manager.
- **`/shift/start`:** store `station_id` from the login result in Dexie and filter `station_members` by it.
- **Login in progress:** disable the name buttons while a login request is running.
- **Sync Indicator offline text:** «غير متصل · محفوظ على الجهاز».

## Noted for later (don't do now)
- An "update available" prompt instead of a silent `skipWaiting` takeover mid-shift.
- Offline PIN login.
- Where session tokens are stored.
- On the first `npm run lint`, watch for React-Compiler hook rules (`set-state-in-effect`) around the roster-loading effect.

## Done when
- The CORS preflight check prints 204 with `access-control-allow-origin: *`.
- `npm run build` and `npm run lint` pass.
- In `npm run dev`:
  - `/setup` saves the device.
  - Choosing خالد and entering **0000** shows «بقيت محاولات» with the right count and plural.
  - Choosing خالد and entering **4821** opens «مرحباً خالد».
- The offline test uses `npm run build && npm start` with DevTools set to offline:
  - The installed page opens and shows the app's offline state.
  - «تبديل العامل» really signs the attendant out.
- One commit, with the app, the two Cowork files and these fixes, pushed to GitHub, plus a short Arabic summary for the user.
