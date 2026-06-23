---
name: Wearable integrations
description: Oura, Whoop, Garmin OAuth flows, DB schema, sync job, and mobile connection UI
---

## Architecture

- **wearable_tokens** table: `(userId, source)` unique. For Garmin OAuth 1.0a, `accessTokenEnc` = access token, `refreshTokenEnc` = access token secret (repurposed field, no actual refresh).
- **wearable_data** table: `(userId, source, date, metric)` unique — all upserts use `onConflictDoUpdate`.
- `source` values: `'oura'` | `'whoop'` | `'garmin'`.

## Backend routes

- `GET /api/integrations/{source}/init` (requireAuth) → returns `{ authUrl }` for mobile to open
- `GET /api/integrations/{source}/callback` → exchanges code for tokens, stores encrypted, redirects to HTML page with deep-link
- `DELETE /api/integrations/{source}/disconnect` (requireAuth) → deletes row
- `POST /api/integrations/{source}/webhook` → HMAC signature verification, then store/trigger sync
- `GET /api/integrations/status` (requireAuth) → `{ oura, whoop, garmin: boolean }`

## Garmin specifics

- OAuth 1.0a (not 2.0): request token → user authorizes at `connect.garmin.com/oauthConfirm` → access token
- In-memory `pendingRequestTokens` Map for request token ↔ userId binding (TTL 10min, GC'd every 5min)
- Garmin is **push-only** — no polling. Data arrives via webhook when device syncs with Garmin Connect
- Webhook URL must be manually registered at https://healthapi.garmin.com/
- Env vars: `GARMIN_CONSUMER_KEY`, `GARMIN_CONSUMER_SECRET`

## Oura specifics

- OAuth 2.0 with PKCE-less flow (server-side secret)
- Pulls: `daily_sleep`, `sleep` (detailed with HRV), `daily_readiness`, `daily_activity`
- Webhook: `X-Ouraring-Signature` header = HMAC-SHA256(body, `OURA_WEBHOOK_SECRET`)
- Env vars: `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `OURA_WEBHOOK_SECRET`

## Whoop specifics

- OAuth 2.0; endpoint base: `api.prod.whoop.com`
- Pulls: recovery (HRV, resting HR, recovery score), sleep, cycles (strain)
- Webhook: `X-WHOOP-Signature` HMAC-SHA256 with `WHOOP_WEBHOOK_SECRET`
- Env vars: `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_WEBHOOK_SECRET`

## Sync job

- `startWearableSyncJob()` in `wearableSyncJob.ts` — setInterval every 30min, fires on even UTC hours (0,2,4…22)
- Token refresh happens inline before each user's sync
- Garmin excluded from polling (push-only)

## Mobile UI (connections.tsx)

- `OAUTH_IDS = Set(['oura', 'whoop', 'garmin'])` — these three use real OAuth, all others use local AsyncStorage toggle
- On mount: fetch `/api/integrations/status` and merge into `connected` state
- Connect: call init endpoint → get authUrl → `Linking.openURL(authUrl)`
- Deep-link handler: `Linking.addEventListener('url', ...)` listens for `valo://integrations?connected={source}` → calls `refreshWearableStatus()`
- Disconnect: calls `DELETE /api/integrations/{source}/disconnect` then clears local state

**Why:** `refreshTokenEnc` reused for Garmin token secret to avoid schema change; this must be understood to avoid decoding it as a real refresh token.
