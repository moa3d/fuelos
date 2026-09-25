---
name: fuelos-accounting
description: Use when writing or reviewing any FuelOS code that touches money, fuel stock, shifts, sales, invoices, expenses, company credit, journal entries, reports or profit. Holds the posting map, the cash formula, reversal and period-close rules, and cost/profit rules.
---

# FuelOS accounting rules

The database already enforces most of these rules (`supabase/migrations`). App code must **never** work around them: no direct inserts into ledger tables from clients, and no "fixing" numbers in the UI.

## Golden rules
1. **Double entry.** Every financial event becomes one balanced `journal_entries` row (Σdebit = Σcredit > 0, ≥ 2 lines). The balancing is done by SECURITY DEFINER RPCs, never by the client.
2. **Posted means immutable.** Corrections are **reversal entries** (`reverse_journal_entry(entry, reason)`), and the reason is mandatory. An entry can be reversed once. Nothing is silently deleted: the spec says «لا يوجد حذف صامت».
3. **Closed periods stay closed** (`close_period`). They cannot be reopened. An adjustment for a closed month is posted in the current open period, with a reason that names the old month.
4. **Every sensitive change is audited** automatically (`audit_log`, via triggers). A reason field in the UI must reach the DB column (`reason`, `decision_note`, `diff_reason`, `void_reason`).

## Shift money (meter-based)
- Cash fills are **not** recorded one by one. Liters come from the meter: `liters = closing_reading − opening_reading` per nozzle.
- Card / credit (آجل) / voucher fills **must** be recorded with `record_sale`. A fill for a linked customer is recorded too, so it gets an invoice.
- **Expected cash = opening_cash + meter_sales − card − credit − voucher.** Implemented in `shift_summary()`. Never re-implement it in the app; call the RPC and show its numbers.
- If the cash difference is above `stations.cash_tolerance` (default 1,000 ل.س), a written reason is required (`FUELOS_REASON_REQUIRED`).
- **One price per shift.** Every sale in a shift uses the price in force at shift open (`price_at(opened_at)`), and the server price wins over the device (`price_adjusted: true` in the response). When the owner publishes a new price, the UI must warn that shifts currently open keep the old price until they are closed.
- Approval (`decide_approval`) posts everything in one transaction:
  - the sales entry
  - stock `sale` movements
  - COGS
  - invoice confirmation
  - loyalty points

  A shift with over-limit credit sales still pending cannot be approved (`FUELOS_PENDING_APPROVALS`).
- Reopening an approved shift (`reopen_shift`) reverses its entries and returns its stock. Re-approval then posts again, so nothing is counted twice.

## Posting map (account codes are fixed — never renumber system accounts)
| Event | Debit | Credit |
|---|---|---|
| Delivery with cost | 1200 مخزون الوقود | 2000 ذمم الموردين |
| Shift approved | 1000 cash in (counted − opening), 1020 cards, 1100 companies, 2100 vouchers | 4000 مبيعات الوقود |
| Cash shortage | 5300 عجز الصندوق, or 1150 ذمم الموظفين (option `shortage_to_employee`) | |
| Cash surplus | | 4200 زيادة الصندوق |
| COGS | 5000 تكلفة الوقود المباع | 1200 |
| Stock count difference | 5400 ↔ 1200 (by sign) | |
| Expense | 5100 salaries, 5200 utilities, 5250 maintenance, 5260 transport, 5900 other | 1000 cash / 1010 bank |
| Company payment | 1000 / 1010 | 1100 |

The full chart is in `create_station_defaults()`. Add a new account only with a new code. `is_system = true` accounts cannot be deactivated.

## Stock
- Book stock = `SUM(inventory_movements.liters)` per tank (signed; view `tank_book_levels`). Movements are append-only.
- A physical dip (`record_tank_measurement`) within `stock_tolerance_l` (default 100 L) auto-adjusts. Beyond that it creates a `stock_adjustment` approval.
- The spec has no sensors: availability shown to customers is **computed from book stock or set manually**, always with its source and time.

## Cost & profit
- COGS = liters × weighted average cost of **priced** deliveries to that tank (`tank_avg_cost`).
- A delivery with no purchase price (`unit_cost IS NULL`) moves stock but not the ledger. Profit is then an **estimate**:
  - The COGS entry is tagged «(تكلفة غير مكتملة)».
  - Reports must label the profit «ربح تقديري» next to the missing-cost warning («سعر شراء الشحنة الأخيرة غير مدخل»).
- «ربح مؤكد» is shown only when every delivery in the period has a cost and expenses are posted.

## Company credit (آجل)
- Remaining credit = `credit_limit − (Σ non-voided credit sales − Σ payments)`.
- Over the limit → `FUELOS_CREDIT_LIMIT`, with `detail = {"remaining", "possible_liters"}`. The worker UI offers two choices: «املأ X لتر فقط» or «اطلب موافقة المدير» (`p_request_approval := true` → `pending_approval`).
- A rejected over-limit sale is voided and its invoice cancelled. The fuel was still dispensed, so at approval it shows as a cash shortage.
- A frozen or suspended company → `FUELOS_COMPANY_FROZEN` / `FUELOS_COMPANY_SUSPENDED`.

## Money in code
- The DB uses `numeric(16,2)` for money and `numeric(14,3)` for liters. In TypeScript, never use floating point for money: use integer minor units or a decimal library.
- Display with Latin digits 0-9 and a thousands separator (`1,250`), then « ل.س ». Rounding happens in SQL (`round(x, 2)`).

## When you add a financial feature
1. Write it as a SECURITY DEFINER RPC that calls `require_role(...)` first. Make it NULL-safe: `auth.uid()` is NULL for guests, so compare with `coalesce(... = auth.uid(), false)`.
2. Post with `post_entry(...)`. It is internal, so the client cannot call it.
3. Add a case to `supabase/tests/10_business_rules_test.sql`, then run `supabase/tests/local/run_local.sh` or `supabase test db`.
4. Update `docs/data-model.md` §4 if you add a posting rule.
