import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { db, wearableTokensTable, wearableDataTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { encrypt, decrypt, signState } from "../lib/tokenCrypto";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const WHOOP_SCOPES = "offline read:recovery read:cycles read:sleep read:workout read:profile";
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
  return `${proto}://${host}/api/integrations/whoop/callback`;
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
    if (sig !== signState(payload)) return null;
    const tsStr = decoded.slice(secondLastColon + 1, lastColon);
    if (Date.now() - Number(tsStr) > STATE_TTL_MS) return null;
    return payload.slice(0, secondLastColon);
  } catch {
    return null;
  }
}

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${title}</title>
  <style>*{box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#F7F5F2;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}.card{background:#fff;border-radius:16px;padding:40px 32px;max-width:380px;width:100%;text-align:center;box-shadow:0 2px 20px rgba(0,0,0,.07)}h1{font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 12px}p{font-size:15px;color:#6B7280;margin:0 0 28px;line-height:1.6}.icon{font-size:40px;margin-bottom:16px}.btn{display:inline-block;background:#C17B3F;color:#fff;border-radius:10px;padding:13px 28px;text-decoration:none;font-size:15px;font-weight:600}</style>
  </head><body><div class="card">${body}</div></body></html>`;
}

// GET /api/integrations/whoop/init
router.get("/integrations/whoop/init", requireAuth, (req, res): void => {
  const userId = (req as AuthenticatedRequest).userId;

  if (!process.env.WHOOP_CLIENT_ID || !process.env.WHOOP_CLIENT_SECRET) {
    res.status(503).json({ error: "Whoop OAuth not configured" });
    return;
  }

  const redirectUri = buildRedirectUri(req);
  const state = makeState(userId);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.WHOOP_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: WHOOP_SCOPES,
    state,
  });

  res.json({ authUrl: `https://api.prod.whoop.com/oauth/oauth2/auth?${params}` });
});

// GET /api/integrations/whoop/callback
router.get("/integrations/whoop/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error || !code || !state) {
    res.send(htmlPage("Valo — Connection Failed",
      `<div class="icon">&#x26A0;</div><h1>Connection failed</h1><p>${error ?? "Whoop did not return an authorization code."}</p>`));
    return;
  }

  const userId = parseState(state);
  if (!userId) {
    res.send(htmlPage("Valo — Connection Failed",
      `<div class="icon">&#x26A0;</div><h1>Expired link</h1><p>This authorization link has expired. Please try again from the app.</p>`));
    return;
  }

  const redirectUri = buildRedirectUri(req);
  const tokenRes = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.WHOOP_CLIENT_ID ?? "",
      client_secret: process.env.WHOOP_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    req.log?.warn({ status: tokenRes.status }, "Whoop token exchange failed");
    res.send(htmlPage("Valo — Connection Failed",
      `<div class="icon">&#x26A0;</div><h1>Token exchange failed</h1><p>Could not retrieve tokens from Whoop. Please try again.</p>`));
    return;
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
  await db.insert(wearableTokensTable)
    .values({
      userId,
      source: "whoop",
      accessTokenEnc: encrypt(tokenData.access_token),
      refreshTokenEnc: encrypt(tokenData.refresh_token),
      scope: WHOOP_SCOPES,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [wearableTokensTable.userId, wearableTokensTable.source],
      set: {
        accessTokenEnc: encrypt(tokenData.access_token),
        refreshTokenEnc: encrypt(tokenData.refresh_token),
        scope: WHOOP_SCOPES,
        expiresAt,
        updatedAt: new Date(),
      },
    });

  logger.info({ userId }, "Whoop connected");
  res.send(htmlPage("Valo — Whoop Connected",
    `<div class="icon">&#x2705;</div><h1>Whoop connected</h1><p>Your Whoop is now linked to Valo. Return to the app.</p><a href="valo://integrations?connected=whoop" class="btn">Return to Valo</a>`));
});

// DELETE /api/integrations/whoop/disconnect
router.delete("/integrations/whoop/disconnect", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  await db.delete(wearableTokensTable).where(
    and(eq(wearableTokensTable.userId, userId), eq(wearableTokensTable.source, "whoop")),
  );
  logger.info({ userId }, "Whoop disconnected");
  res.json({ ok: true });
});

// POST /api/integrations/whoop/webhook
// Whoop signs requests with X-WHOOP-Signature: HMAC-SHA256(body, client_secret)
router.post("/integrations/whoop/webhook", async (req, res): Promise<void> => {
  const secret = process.env.WHOOP_WEBHOOK_SECRET ?? process.env.WHOOP_CLIENT_SECRET;
  if (secret) {
    const sig = req.headers["x-whoop-signature"] as string | undefined;
    const rawBody = JSON.stringify(req.body);
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!sig || sig !== expected) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  }

  const event = req.body as { user_id?: number; type?: string };
  logger.info({ whoopUserId: event.user_id, type: event.type }, "Whoop webhook received");

  res.status(200).json({ received: true });
});

export default router;
