# Brief 02b — fixes from the review of the shift-legs screens (do before S2)

Written by Claude in Cowork on 2026-09-26. An independent reviewer read the current code against:
- the spec `docs/superpowers/specs/2026-09-26-shift-pump-legs-design.md`;
- the deployed SQL `supabase/migrations/20260926000200_shift_legs.sql`.

Cowork checked each finding below against the code. **Do not edit `supabase/`.** Talk to the owner in Arabic.

What is already right, keep it as is:
- every RPC name and parameter matches the database;
- money uses BigInt cents and readings use tenths;
- the gap note uses the same rule at S1 and at the move;
- the 20 unit tests pass.

## 1. Critical — a lost answer on `submit_shift` gets the queue stuck forever
The scenario:
1. The server saves the close, but the answer never reaches the phone (weak signal).
2. The retry gets `FUELOS_BAD_SHIFT_TRANSITION` with detail `submitted`.
3. `classifyFailure` makes it `failed_permanent`, and `RefusedBanner` says nothing changed on the server.
4. «عدّل الإغلاق» reopens the local shift. Every new submit fails the same way.

Fix:
- In `lib/outbox-policy.ts`, add a pure function:
  ```ts
  /** submit_shift has no client id: a replay after a lost answer means the first attempt worked. */
  export function alreadyApplied(rpc: string, f: RpcFailure): boolean {
    return rpc === "submit_shift" && f.message === "FUELOS_BAD_SHIFT_TRANSITION"
      && ["submitted", "approved", "rejected"].includes((f.details ?? "").trim());
  }
  ```
- In `lib/outbox.ts` `send()`, check it **before** `classifyFailure`. When it is true, mark the row `sent`, exactly like a success, and continue the queue.
- Test first in `lib/outbox-policy.test.ts`. It must fail before the change:
  ```ts
  test("a submit replayed after its answer was lost counts as sent", () => {
    const f = { status: 400, code: "P0001", message: "FUELOS_BAD_SHIFT_TRANSITION", details: "submitted" };
    assert.equal(alreadyApplied("submit_shift", f), true);
    assert.equal(alreadyApplied("submit_shift", { ...f, details: "approved" }), true);
    assert.equal(alreadyApplied("submit_shift", { ...f, details: "open" }), false);
    assert.equal(alreadyApplied("record_sale", f), false);
    assert.equal(alreadyApplied("submit_shift", { status: 400, code: "P0001", message: "FUELOS_REASON_REQUIRED" }), false);
  });
  ```

## 2. Important — double tap can queue two moves or two opens
`start()`, `confirm()` and `submit()` are guarded only by the `saving` state. A fast double tap runs the handler twice before React re-renders, which creates two rows with two different UUIDs.

What happens with a second `switch_pump`: the server refuses it because its closing readings don't belong to the new leg. The queue then stops on a confusing error.

Fix: add a synchronous guard in all three pages:
```ts
const busy = useRef(false);
async function confirm() {
  if (busy.current) return;
  busy.current = true;
  try { /* existing body */ } finally { busy.current = false; }
}
```
Keep `saving` for the UI.

## 3. Important — an offline pump conflict on `open_shift` shows the wrong message
In `app/worker-header.tsx` (`RefusedBanner`), `PUMP_TAKEN_OFFLINE_MESSAGE` is used only for `switch_pump`. The spec (§7) says it applies to both: two attendants took the same pump offline, and the first one to reach the server wins.

Fix:
- Use the message for `rpc === "open_shift" || rpc === "switch_pump"` whenever `lastErrorCode === "FUELOS_PUMP_BUSY"`.
- For the refused `open_shift`, keep «ابدأ من جديد»: nothing was created on the server.

## 4. Important — the close wizard uses stale station data
`app/shift/close/page.tsx` reads only the cached reference data, which can be hours old. A changed `cash_tolerance` (or prices) can make the app skip the reason field. The server then refuses with `FUELOS_REASON_REQUIRED` after the attendant has finished the review.

Fix:
- When online, call `loadReference(stationId)` on entry, like the move page does.
- Compute the expected cash from the server's `shift_summary`. Its `nozzles[].price` is the shift's price: the price at shift open, which is the one the server will use.
- Add the current pump's liters × that price, rounded per nozzle to the cent.
- Offline, keep the «تقديري» label.

## 5. Minor — do later, not before S2
`/shift` and `/shift/done` trust only the local status. If the owner rejects and reopens a shift, a device still showing «تم إرسال الإغلاق» won't find out.

Later fix: when online, re-read the attendant's open shift from the server (`findOpenShiftOnServer`).

## Done when
- `npm test` passes, including the new test, and `npm run lint` and `npm run build` pass.
- The browser test:
  1. Move from pump 1 to pump 3 with a gap note.
  2. Close with the review listing both pumps. «فرق الصندوق» is 0 when you type the expected cash.
  3. Double tapping «تأكيد الانتقال» creates only **one** `switch_pump` row in IndexedDB.
- One commit and a push, then a short Arabic summary for the owner.
