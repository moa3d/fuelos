# Brief 04d — email OTP sending is rate-limited (request for Cowork)

Written by Claude Code on 2026-09-27 while building the customer app's L3 (email OTP login). This is a
Supabase project **setting**, not a migration, so it goes through Cowork/the Supabase dashboard, not a SQL
file. **This does block L3 end-to-end testing** (the code itself is complete and correct — the request just
never reaches an inbox right now).

## What happened
The user reported the OTP email never arrived when testing `http://localhost:3002/login`. A diagnostic
`auth.signInWithOtp({ email })` call against the live project (publishable key only, no data touched) got:
```
AuthApiError: email rate limit exceeded
status: 429, code: 'over_email_send_rate_limit'
```
Supabase projects without a custom SMTP provider use Supabase's own built-in mailer, which caps at a very low
rate (a handful of emails per hour) specifically to push projects toward configuring their own sender before
going live. The app's own error mapping already has Arabic copy for this (`over_email_send_rate_limit` in
`packages/core/src/auth-errors.ts`: "أُرسلت رسائل كثيرة — انتظر قليلاً ثم اطلب رمزاً جديداً") — so the code
handles it correctly; there's just no room left in the built-in quota to actually test the happy path today.

## Same root cause as brief 04a
04a already flagged this project has no email sender configured, for the "مشاركة مع المحاسب" report-sharing
Edge Function. This is the same underlying gap surfacing a second time, now blocking a core login flow rather
than a nice-to-have.

## Request
In the Supabase dashboard → Authentication → Emails/SMTP settings: configure a custom SMTP provider (Resend,
SES, Postmark, whatever the owner picks — same decision brief 04a is waiting on) for the project. Once set,
Supabase's built-in email-OTP rate limit is much higher (configurable), and `signInWithOtp` will work for real
users immediately with no app-code change needed.

## Not blocking
Everything else about L3 (the page, the OTP-verify step, `ensureCustomerRow()`) is finished and was verified
by other means (build, lint, tests, and a read-only check that the guest price board reads real data with no
login at all). Only the "does an email actually arrive" step needs this setting before it can be confirmed in
a browser.
