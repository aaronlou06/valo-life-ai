import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { db, googleTokensTable, calendarEventsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { encrypt, decrypt, signState } from "../lib/tokenCrypto";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
].join(" ");

const STATE_TTL_MS = 10 * 60 * 1000;

function buildRedirectUri(req: { headers: Record<string, string | string[] | undefined> }): string {
  const proto =
    (Array.isArray(req.headers["x-forwarded-proto"])
      ? req.headers["x-forwarded-proto"][0]
      : req.headers["x-forwarded-proto"]) ?? "https";
  const host =
    (Array.isArray(req.headers["host"])
      ? req.headers["host"][0]
      : req.headers["host"]) ?? "localhost";
  return `${proto}://${host}/api/auth/google/callback`;
}

function makeState(userId: string): string {
  const payload = `${userId}:${Date.now()}`;
  const sig = signState(payload);
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function parseState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const lastColon = decoded.lastIndexOf(":");
    const secondLastColon = decoded.lastIndexOf(":", lastColon - 1);
    const payload = decoded.slice(0, lastColon);
    const sig = decoded.slice(lastColon + 1);
    const expectedSig = signState(payload);
    if (sig !== expectedSig) return null;
    const tsStr = decoded.slice(secondLastColon + 1, lastColon);
    if (Date.now() - Number(tsStr) > STATE_TTL_MS) return null;
    return payload.slice(0, secondLastColon);
  } catch {
    return null;
  }
}

async function getValidAccessToken(userId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(googleTokensTable)
    .where(eq(googleTokensTable.userId, userId));

  if (!row) {
    logger.warn({ userId }, "getValidAccessToken: no token row found");
    return null;
  }

  const secsUntilExpiry = Math.round((row.expiresAt.getTime() - Date.now()) / 1000);
  logger.info({ userId, secsUntilExpiry }, "getValidAccessToken: token row found");

  if (row.expiresAt > new Date(Date.now() + 60_000)) {
    logger.info({ userId }, "getValidAccessToken: access token still valid, returning cached");
    return decrypt(row.accessTokenEnc);
  }

  logger.info({ userId }, "getValidAccessToken: token expired, attempting refresh");
  const refreshToken = decrypt(row.refreshTokenEnc);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "(unreadable)");
    logger.error({ userId, status: tokenRes.status, body }, "getValidAccessToken: token refresh failed");
    return null;
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    expires_in: number;
  };
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
  await db
    .update(googleTokensTable)
    .set({
      accessTokenEnc: encrypt(tokenData.access_token),
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(googleTokensTable.userId, userId));

  logger.info({ userId, expiresAt }, "getValidAccessToken: token refreshed and stored");
  return tokenData.access_token;
}

export { getValidAccessToken };

function htmlPage(title: string, heading: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #F7F5F2; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
    .card { background: #fff; border-radius: 16px; padding: 40px 32px; max-width: 380px; width: 100%; text-align: center; box-shadow: 0 2px 20px rgba(0,0,0,0.07); }
    h1 { font-size: 20px; font-weight: 600; color: #1a1a1a; margin: 0 0 12px; }
    p { font-size: 15px; color: #6B7280; margin: 0 0 28px; line-height: 1.6; }
    .icon { font-size: 40px; margin-bottom: 16px; }
    .btn { display: inline-block; background: #C17B3F; color: #fff; border-radius: 10px; padding: 13px 28px; text-decoration: none; font-size: 15px; font-weight: 600; }
    .btn-muted { background: #6B7280; }
  </style>
</head>
<body>
  <div class="card">
    ${body}
  </div>
</body>
</html>`;
}

router.get(
  "/auth/google/init",
  requireAuth,
  (req, res): void => {
    const userId = (req as AuthenticatedRequest).userId;

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      res.status(503).json({ error: "Google OAuth not configured" });
      return;
    }

    const redirectUri = buildRedirectUri(req);
    const state = makeState(userId);

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    res.json({ authUrl, redirectUri });
  },
);

router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error || !code || !state) {
    res.send(
      htmlPage(
        "Valo — Connection Failed",
        "Connection failed",
        `<div class="icon">&#x26A0;</div><h1>Connection failed</h1><p>${error ?? "Google did not return an authorization code. Please try again from the app."}</p>`,
      ),
    );
    return;
  }

  const userId = parseState(state);
  if (!userId) {
    res.send(
      htmlPage(
        "Valo — Connection Failed",
        "Connection failed",
        `<div class="icon">&#x26A0;</div><h1>Invalid or expired link</h1><p>This authorization link has expired. Please start the connection again from the Valo app.</p>`,
      ),
    );
    return;
  }

  const redirectUri = buildRedirectUri(req);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    req.log?.warn({ status: tokenRes.status }, "Google token exchange failed");
    res.send(
      htmlPage(
        "Valo — Connection Failed",
        "Connection failed",
        `<div class="icon">&#x26A0;</div><h1>Token exchange failed</h1><p>Could not retrieve tokens from Google. Please try again.</p>`,
      ),
    );
    return;
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  if (!tokenData.refresh_token) {
    res.send(
      htmlPage(
        "Valo — Already Connected",
        "Already connected",
        `<div class="icon">&#x2713;</div><h1>Already connected</h1><p>Your Google Calendar is already linked to Valo. Return to the app.</p><a href="valo://auth?status=connected" class="btn">Return to Valo</a>`,
      ),
    );
    return;
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
  const accessTokenEnc = encrypt(tokenData.access_token);
  const refreshTokenEnc = encrypt(tokenData.refresh_token);

  await db
    .insert(googleTokensTable)
    .values({
      userId,
      accessTokenEnc,
      refreshTokenEnc,
      scope: tokenData.scope,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: googleTokensTable.userId,
      set: {
        accessTokenEnc,
        refreshTokenEnc,
        scope: tokenData.scope,
        expiresAt,
        updatedAt: new Date(),
      },
    });

  req.log?.info({ userId }, "Google Calendar connected");

  void syncCalendarEvents(userId, tokenData.access_token).catch(() => {});

  res.send(
    htmlPage(
      "Valo — Calendar Connected",
      "Calendar connected",
      `<div class="icon">&#x2705;</div><h1>Calendar connected</h1><p>Your Google Calendar is now linked to Valo. Return to the app to see today's events.</p><a href="valo://auth?status=connected" class="btn">Return to Valo</a>`,
    ),
  );
});

async function syncCalendarEvents(userId: string, accessToken: string): Promise<void> {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 30);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  logger.info({ userId, timeMin: now.toISOString(), timeMax: end.toISOString() }, "syncCalendarEvents: fetching from Google");

  const gcalRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!gcalRes.ok) {
    const body = await gcalRes.text().catch(() => "(unreadable)");
    logger.error({ userId, status: gcalRes.status, body }, "syncCalendarEvents: Google Calendar API error");
    return;
  }

  const gcalData = (await gcalRes.json()) as { items?: Record<string, unknown>[]; nextPageToken?: string; summary?: string };
  const items = gcalData.items ?? [];

  logger.info(
    { userId, calendarName: gcalData.summary ?? "(unknown)", itemCount: items.length, hasNextPage: !!gcalData.nextPageToken },
    "syncCalendarEvents: Google API responded",
  );

  if (items.length > 0) {
    const sample = items.slice(0, 3).map((i) => ({
      summary: (i.summary as string | undefined) ?? "(no title)",
      start: (i.start as Record<string, string> | undefined)?.dateTime ?? (i.start as Record<string, string> | undefined)?.date ?? null,
    }));
    logger.info({ userId, sample }, "syncCalendarEvents: first few events");
  }

  await db
    .delete(calendarEventsTable)
    .where(
      and(
        eq(calendarEventsTable.userId, userId),
        eq(calendarEventsTable.type, "google"),
      ),
    );

  logger.info({ userId }, "syncCalendarEvents: existing rows deleted");

  if (items.length === 0) {
    logger.info({ userId }, "syncCalendarEvents: no events returned by Google — nothing to insert");
    return;
  }

  const rows = items.map((item) => {
    const startRaw =
      (item.start as Record<string, string> | undefined)?.dateTime ??
      (item.start as Record<string, string> | undefined)?.date ??
      null;
    const endRaw =
      (item.end as Record<string, string> | undefined)?.dateTime ??
      (item.end as Record<string, string> | undefined)?.date ??
      null;
    const date = startRaw ? startRaw.substring(0, 10) : now.toISOString().substring(0, 10);
    return {
      userId,
      title: (item.summary as string | undefined) ?? "Untitled",
      date,
      startTime: startRaw ? new Date(startRaw) : null,
      endTime: endRaw ? new Date(endRaw) : null,
      type: "google" as const,
      notes: (item.description as string | undefined) ?? null,
      location: (item.location as string | undefined) ?? null,
    };
  });

  await db.insert(calendarEventsTable).values(rows);
  logger.info({ userId, inserted: rows.length }, "syncCalendarEvents: inserted events into DB");
}

export { syncCalendarEvents };
export default router;
