---
name: password reset flow
description: Email-code password reset (forgot/reset) security invariants for the Express auth server.
---

# Password reset (email 6-digit code, no deep links)

Flow: `POST /auth/forgot-password` (request code) → `POST /auth/reset-password` (verify code + set new password). Codes are 6-digit, hashed (bcrypt cost 12), 15-min TTL, single-use, stored in `password_reset_tokens` (text user_id, no FK).

## Security invariants — keep all of these

- **Anti-enumeration:** forgot-password always returns the same `{ok:true}` 200 for registered and unregistered emails. Only registered users do DB writes + email send.
  - **Timing:** always run a bcrypt hash regardless of user existence (dominant cost, equalizes paths), AND send the email fire-and-forget (`void send(...).catch(log)`) so the Resend round-trip never adds latency that would re-open a timing oracle.
- **Both endpoints are rate-limited** by email AND IP via the in-memory sliding-window `rateLimit()`. reset-password MUST be throttled (10/15min) — a 6-digit code over 15 min is brute-forceable otherwise. Returns 429 + `Retry-After`.
- **Single-use must be atomic.** Read-then-update is a race (two concurrent valid requests both pass). Consume inside a `db.transaction`: conditional `UPDATE ... SET used_at=now() WHERE id=? AND used_at IS NULL RETURNING id`; if 0 rows claimed, reject. Only then update the password. Verified: concurrent same-code requests yield exactly one 200, one 400.
- **Pick the NEWEST token:** `orderBy(desc(createdAt))`. Ascending picks the oldest/stale token and breaks the success path when multiple active tokens exist.
- On success, null `sessionToken` + `sessionExpiresAt` (in the same transaction) so all active sessions are invalidated.

**Why:** architect review flagged missing reset throttling (brute-force) and the single-use race as blocking; the asc-orderBy bug silently failed the valid-code path. All three are easy to reintroduce.

## Resend

`src/lib/resendEmail.ts`. from = `RESEND_FROM_EMAIL || "Valo <onboarding@resend.dev>"`. In test mode Resend only delivers to the account owner's email and returns 403 for others — that 403 is caught/logged and the endpoint still returns 200 (correct anti-enum behavior). `RESEND_API_KEY` is a secret. `logger` import path inside lib is `./logger`.
