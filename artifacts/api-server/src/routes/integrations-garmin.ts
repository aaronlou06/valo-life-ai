// Garmin uses OAuth 1.0a (not 2.0). Data flows device → Garmin Connect → our webhook.
// There is no polling API; all health data arrives via Garmin's push webhook.
//
// IMPORTANT: The webhook URL below must be registered in the Garmin Health API
// developer portal at https://healthapi.garmin.com/
// Register the following URL as your Health API webhook endpoint:
//   https://{your-domain}/api/integrations/garmin/webhook
// Garmin will push dailies, sleeps, hrv, and activity summaries to this URL
// whenever a user's device syncs with Garmin Connect.

import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { db, wearableTokensTable, wearableDataTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { encrypt, decrypt } from "../lib/tokenCrypto";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Temporary in-memory store for OAuth 1.0a request tokens (TTL ~10 minutes).
// Maps oauth_token → { userId, requestTokenSecret }
const pendingRequestTokens = new Map<string, { userId: string; requestTokenSecret: string; ts: number }>();

// Clean up stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, val] of pendingRequestTokens) {
    if (val.ts < cutoff) pendingRequestTokens.delete(key);
  }
}, 5 * 60 * 1000);

// ── OAuth 1.0a signing ────────────────────────────────────────────────────────

function oauthNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

function oauthTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

function percentEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/#/g, "%23")
    .replace(/\*/g, "%2A");
}

function buildOAuth1Signature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): string {
  const sorted = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
    .join("&");

  const base = [method.toUpperCase(), percentEncode(url), percentEncode(sorted)].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return crypto.createHmac("sha1", signingKey).update(base).digest("base64");
}

function buildAuthHeader(params: Record<string, string>): string {
  const parts = Object.entries(params)
    .filter(([k]) => k.startsWith("oauth_"))
    .map(([k, v]) => `${k}="${percentEncode(v)}"`)
    .join(", ");
  return `OAuth ${parts}`;
}

async function garminOAuth1Fetch(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string,
  tokenKey: string,
  tokenSecret: string,
  extraParams: Record<string, string> = {},
): Promise<Response> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: oauthNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: oauthTimestamp(),
    oauth_token: tokenKey,
    oauth_version: "1.0",
    ...extraParams,
  };

  oauthParams.oauth_signature = buildOAuth1Signature(
    method,
    url,
    oauthParams,
    consumerSecret,
    tokenSecret,
  );

  return fetch(url, {
    method,
    headers: { Authorization: buildAuthHeader(oauthParams) },
  });
}

// Fetch request token (no token yet — use empty token key/secret)
async function fetchGarminRequestToken(
  consumerKey: string,
  consumerSecret: string,
  callbackUrl: string,
): Promise<{ token: string; tokenSecret: string } | null> {
  const url = "https://connectapi.garmin.com/oauth-service/oauth/request_token";
  const oauthParams: Record<string, string> = {
    oauth_callback: callbackUrl,
    oauth_consumer_key: consumerKey,
    oauth_nonce: oauthNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: oauthTimestamp(),
    oauth_version: "1.0",
  };
  oauthParams.oauth_signature = buildOAuth1Signature("POST", url, oauthParams, consumerSecret, "");

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: buildAuthHeader(oauthParams) },
  });

  if (!res.ok) {
    logger.warn({ status: res.status }, "Garmin request token failed");
    return null;
  }

  const text = await res.text();
  const params = new URLSearchParams(text);
  const token = params.get("oauth_token");
  const tokenSecret = params.get("oauth_token_secret");
  if (!token || !tokenSecret) return null;
  return { token, tokenSecret };
}

// Exchange request token + verifier for access token
async function fetchGarminAccessToken(
  consumerKey: string,
  consumerSecret: string,
  requestToken: string,
  requestTokenSecret: string,
  verifier: string,
): Promise<{ token: string; tokenSecret: string } | null> {
  const url = "https://connectapi.garmin.com/oauth-service/oauth/access_token";
  const res = await garminOAuth1Fetch(
    "POST",
    url,
    consumerKey,
    consumerSecret,
    requestToken,
    requestTokenSecret,
    { oauth_verifier: verifier },
  );

  if (!res.ok) {
    logger.warn({ status: res.status }, "Garmin access token exchange failed");
    return null;
  }

  const text = await res.text();
  const params = new URLSearchParams(text);
  const token = params.get("oauth_token");
  const tokenSecret = params.get("oauth_token_secret");
  if (!token || !tokenSecret) return null;
  return { token, tokenSecret };
}

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${title}</title>
  <style>*{box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#F7F5F2;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}.card{background:#fff;border-radius:16px;padding:40px 32px;max-width:380px;width:100%;text-align:center;box-shadow:0 2px 20px rgba(0,0,0,.07)}h1{font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 12px}p{font-size:15px;color:#6B7280;margin:0 0 28px;line-height:1.6}.icon{font-size:40px;margin-bottom:16px}.btn{display:inline-block;background:#C17B3F;color:#fff;border-radius:10px;padding:13px 28px;text-decoration:none;font-size:15px;font-weight:600}</style>
  </head><body><div class="card">${body}</div></body></html>`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/integrations/garmin/init — begin OAuth 1.0a flow
router.get("/integrations/garmin/init", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  const consumerKey = process.env.GARMIN_CONSUMER_KEY;
  const consumerSecret = process.env.GARMIN_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    res.status(503).json({ error: "Garmin OAuth not configured" });
    return;
  }

  const proto =
    (Array.isArray(req.headers["x-forwarded-proto"])
      ? req.headers["x-forwarded-proto"][0]
      : req.headers["x-forwarded-proto"]) ?? "https";
  const host =
    (Array.isArray(req.headers["host"])
      ? req.headers["host"][0]
      : req.headers["host"]) ?? "localhost";
  const callbackUrl = `${proto}://${host}/api/integrations/garmin/callback`;

  const requestToken = await fetchGarminRequestToken(consumerKey, consumerSecret, callbackUrl);
  if (!requestToken) {
    res.status(502).json({ error: "Failed to obtain Garmin request token" });
    return;
  }

  pendingRequestTokens.set(requestToken.token, {
    userId,
    requestTokenSecret: requestToken.tokenSecret,
    ts: Date.now(),
  });

  const authUrl = `https://connect.garmin.com/oauthConfirm?oauth_token=${encodeURIComponent(requestToken.token)}`;
  res.json({ authUrl });
});

// GET /api/integrations/garmin/callback — OAuth 1.0a redirect
router.get("/integrations/garmin/callback", async (req, res): Promise<void> => {
  const { oauth_token, oauth_verifier } = req.query as Record<string, string | undefined>;

  if (!oauth_token || !oauth_verifier) {
    res.send(htmlPage("Valo — Connection Failed",
      `<div class="icon">&#x26A0;</div><h1>Connection failed</h1><p>Missing OAuth token or verifier.</p>`));
    return;
  }

  const pending = pendingRequestTokens.get(oauth_token);
  if (!pending) {
    res.send(htmlPage("Valo — Connection Failed",
      `<div class="icon">&#x26A0;</div><h1>Expired link</h1><p>This authorization link has expired. Please try again from the app.</p>`));
    return;
  }
  pendingRequestTokens.delete(oauth_token);

  const consumerKey = process.env.GARMIN_CONSUMER_KEY ?? "";
  const consumerSecret = process.env.GARMIN_CONSUMER_SECRET ?? "";

  const accessToken = await fetchGarminAccessToken(
    consumerKey,
    consumerSecret,
    oauth_token,
    pending.requestTokenSecret,
    oauth_verifier,
  );

  if (!accessToken) {
    res.send(htmlPage("Valo — Connection Failed",
      `<div class="icon">&#x26A0;</div><h1>Token exchange failed</h1><p>Could not retrieve tokens from Garmin. Please try again.</p>`));
    return;
  }

  // For Garmin: accessTokenEnc = access token, refreshTokenEnc = access token secret
  await db.insert(wearableTokensTable)
    .values({
      userId: pending.userId,
      source: "garmin",
      accessTokenEnc: encrypt(accessToken.token),
      refreshTokenEnc: encrypt(accessToken.tokenSecret),
      expiresAt: null, // Garmin OAuth 1.0a tokens don't expire
    })
    .onConflictDoUpdate({
      target: [wearableTokensTable.userId, wearableTokensTable.source],
      set: {
        accessTokenEnc: encrypt(accessToken.token),
        refreshTokenEnc: encrypt(accessToken.tokenSecret),
        expiresAt: null,
        updatedAt: new Date(),
      },
    });

  logger.info({ userId: pending.userId }, "Garmin connected");
  res.send(htmlPage("Valo — Garmin Connected",
    `<div class="icon">&#x2705;</div><h1>Garmin connected</h1><p>Your Garmin Connect is now linked to Valo. Data will sync automatically when your device connects to Garmin Connect.</p><a href="valo://integrations?connected=garmin" class="btn">Return to Valo</a>`));
});

// DELETE /api/integrations/garmin/disconnect
router.delete("/integrations/garmin/disconnect", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  await db.delete(wearableTokensTable).where(
    and(eq(wearableTokensTable.userId, userId), eq(wearableTokensTable.source, "garmin")),
  );
  logger.info({ userId }, "Garmin disconnected");
  res.json({ ok: true });
});

// POST /api/integrations/garmin/webhook — Garmin Health API push
// Garmin pushes dailies, sleeps, hrvsummaries, and activities when a device syncs.
// Verify the signature using X-Garmin-Signature (HMAC-SHA1 of raw body with consumer secret).
router.post("/integrations/garmin/webhook", async (req, res): Promise<void> => {
  const consumerSecret = process.env.GARMIN_CONSUMER_SECRET;
  if (consumerSecret) {
    const sig = req.headers["x-garmin-signature"] as string | undefined;
    const rawBody = JSON.stringify(req.body);
    const expected = crypto.createHmac("sha1", consumerSecret).update(rawBody).digest("hex");
    if (!sig || sig !== expected) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  }

  const payload = req.body as {
    dailies?: Array<{
      userAccessToken?: string;
      startTimeInSeconds?: number;
      steps?: number;
      totalKilocalories?: number;
      activeKilocalories?: number;
      restingHeartRateInBeatsPerMinute?: number;
    }>;
    sleeps?: Array<{
      userAccessToken?: string;
      startTimeInSeconds?: number;
      durationInSeconds?: number;
      deepSleepDurationInSeconds?: number;
      remSleepInSeconds?: number;
      lightSleepDurationInSeconds?: number;
      overallSleepScore?: { value?: number };
    }>;
    hrvsummaries?: Array<{
      userAccessToken?: string;
      startTimeInSeconds?: number;
      weeklyAvg?: number;
      lastNight?: number;
    }>;
    activities?: Array<{
      userAccessToken?: string;
      startTimeInSeconds?: number;
      activityType?: string;
      durationInSeconds?: number;
      activeKilocalories?: number;
    }>;
  };

  // Helper: look up our userId from the Garmin access token embedded in the payload
  async function resolveUserId(accessToken: string): Promise<string | null> {
    const rows = await db.select({ userId: wearableTokensTable.userId, accessTokenEnc: wearableTokensTable.accessTokenEnc })
      .from(wearableTokensTable)
      .where(eq(wearableTokensTable.source, "garmin"));
    for (const row of rows) {
      try {
        if (decrypt(row.accessTokenEnc) === accessToken) return row.userId;
      } catch { /* skip */ }
    }
    return null;
  }

  async function upsertMetric(userId: string, date: string, metric: string, value: number): Promise<void> {
    await db.insert(wearableDataTable)
      .values({ userId, source: "garmin", date, metric, value: String(value), syncedAt: new Date() })
      .onConflictDoUpdate({
        target: [wearableDataTable.userId, wearableDataTable.source, wearableDataTable.date, wearableDataTable.metric],
        set: { value: String(value), syncedAt: new Date() },
      });
  }

  function epochToDate(epochSecs: number): string {
    return new Date(epochSecs * 1000).toISOString().split("T")[0]!;
  }

  // Process each summary type
  for (const daily of payload.dailies ?? []) {
    if (!daily.userAccessToken) continue;
    const userId = await resolveUserId(daily.userAccessToken);
    if (!userId || !daily.startTimeInSeconds) continue;
    const date = epochToDate(daily.startTimeInSeconds);
    if (daily.steps != null) await upsertMetric(userId, date, "steps", daily.steps);
    if (daily.totalKilocalories != null) await upsertMetric(userId, date, "total_calories", daily.totalKilocalories);
    if (daily.activeKilocalories != null) await upsertMetric(userId, date, "active_calories", daily.activeKilocalories);
    if (daily.restingHeartRateInBeatsPerMinute != null) await upsertMetric(userId, date, "resting_hr", daily.restingHeartRateInBeatsPerMinute);
  }

  for (const sleep of payload.sleeps ?? []) {
    if (!sleep.userAccessToken) continue;
    const userId = await resolveUserId(sleep.userAccessToken);
    if (!userId || !sleep.startTimeInSeconds) continue;
    const date = epochToDate(sleep.startTimeInSeconds);
    if (sleep.durationInSeconds != null) await upsertMetric(userId, date, "sleep_total_seconds", sleep.durationInSeconds);
    if (sleep.deepSleepDurationInSeconds != null) await upsertMetric(userId, date, "sleep_deep_seconds", sleep.deepSleepDurationInSeconds);
    if (sleep.remSleepInSeconds != null) await upsertMetric(userId, date, "sleep_rem_seconds", sleep.remSleepInSeconds);
    if (sleep.lightSleepDurationInSeconds != null) await upsertMetric(userId, date, "sleep_light_seconds", sleep.lightSleepDurationInSeconds);
    if (sleep.overallSleepScore?.value != null) await upsertMetric(userId, date, "sleep_score", sleep.overallSleepScore.value);
  }

  for (const hrv of payload.hrvsummaries ?? []) {
    if (!hrv.userAccessToken) continue;
    const userId = await resolveUserId(hrv.userAccessToken);
    if (!userId || !hrv.startTimeInSeconds) continue;
    const date = epochToDate(hrv.startTimeInSeconds);
    if (hrv.lastNight != null) await upsertMetric(userId, date, "hrv_ms", hrv.lastNight);
    if (hrv.weeklyAvg != null) await upsertMetric(userId, date, "hrv_weekly_avg", hrv.weeklyAvg);
  }

  for (const activity of payload.activities ?? []) {
    if (!activity.userAccessToken) continue;
    const userId = await resolveUserId(activity.userAccessToken);
    if (!userId || !activity.startTimeInSeconds) continue;
    const date = epochToDate(activity.startTimeInSeconds);
    if (activity.durationInSeconds != null) await upsertMetric(userId, date, "activity_duration_seconds", activity.durationInSeconds);
    if (activity.activeKilocalories != null) await upsertMetric(userId, date, "activity_calories", activity.activeKilocalories);
  }

  logger.info({ dailies: payload.dailies?.length ?? 0, sleeps: payload.sleeps?.length ?? 0, hrv: payload.hrvsummaries?.length ?? 0 }, "Garmin webhook processed");
  res.status(200).json({ received: true });
});

export default router;
