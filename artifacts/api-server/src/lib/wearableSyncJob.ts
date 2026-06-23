// Polls Oura and Whoop APIs every 2 hours for all connected users.
// Garmin is push-only (webhook) so it has no polling job here.

import { eq } from "drizzle-orm";
import { db, wearableTokensTable, wearableDataTable } from "@workspace/db";
import { encrypt, decrypt } from "./tokenCrypto";
import { logger } from "./logger";

const SYNC_INTERVAL_MS = 30 * 60 * 1000; // check every 30 min
const EVEN_UTC_HOURS = new Set([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);

// ── Token refresh helpers ─────────────────────────────────────────────────────

async function refreshOuraToken(userId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(wearableTokensTable)
    .where(eq(wearableTokensTable.userId, userId));
  if (!row || row.source !== "oura") return null;

  if (row.expiresAt && row.expiresAt > new Date(Date.now() + 60_000)) {
    return decrypt(row.accessTokenEnc);
  }

  const res = await fetch("https://api.ouraring.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decrypt(row.refreshTokenEnc),
      client_id: process.env.OURA_CLIENT_ID ?? "",
      client_secret: process.env.OURA_CLIENT_SECRET ?? "",
    }),
  });
  if (!res.ok) {
    logger.warn({ userId, status: res.status }, "Oura token refresh failed");
    return null;
  }
  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await db
    .update(wearableTokensTable)
    .set({
      accessTokenEnc: encrypt(data.access_token),
      ...(data.refresh_token ? { refreshTokenEnc: encrypt(data.refresh_token) } : {}),
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(wearableTokensTable.userId, userId));
  return data.access_token;
}

async function refreshWhoopToken(userId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(wearableTokensTable)
    .where(eq(wearableTokensTable.userId, userId));
  if (!row || row.source !== "whoop") return null;

  if (row.expiresAt && row.expiresAt > new Date(Date.now() + 60_000)) {
    return decrypt(row.accessTokenEnc);
  }

  const res = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decrypt(row.refreshTokenEnc),
      client_id: process.env.WHOOP_CLIENT_ID ?? "",
      client_secret: process.env.WHOOP_CLIENT_SECRET ?? "",
    }),
  });
  if (!res.ok) {
    logger.warn({ userId, status: res.status }, "Whoop token refresh failed");
    return null;
  }
  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await db
    .update(wearableTokensTable)
    .set({
      accessTokenEnc: encrypt(data.access_token),
      ...(data.refresh_token ? { refreshTokenEnc: encrypt(data.refresh_token) } : {}),
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(wearableTokensTable.userId, userId));
  return data.access_token;
}

// ── Metric upsert helper ──────────────────────────────────────────────────────

async function upsertMetric(
  userId: string,
  source: string,
  date: string,
  metric: string,
  value: number,
): Promise<void> {
  await db
    .insert(wearableDataTable)
    .values({ userId, source, date, metric, value: String(value), syncedAt: new Date() })
    .onConflictDoUpdate({
      target: [
        wearableDataTable.userId,
        wearableDataTable.source,
        wearableDataTable.date,
        wearableDataTable.metric,
      ],
      set: { value: String(value), syncedAt: new Date() },
    });
}

// ── Oura sync ────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0]!;
}

async function syncOuraUser(userId: string, accessToken: string): Promise<void> {
  const startDate = daysAgo(7);
  const endDate = new Date().toISOString().split("T")[0]!;
  const headers = { Authorization: `Bearer ${accessToken}` };

  // Sleep scores + totals
  const sleepRes = await fetch(
    `https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${startDate}&end_date=${endDate}`,
    { headers },
  );
  if (sleepRes.ok) {
    const body = (await sleepRes.json()) as { data: Array<{ day: string; score?: number }> };
    for (const row of body.data ?? []) {
      if (row.score != null) await upsertMetric(userId, "oura", row.day, "sleep_score", row.score);
    }
  }

  // Detailed sleep (HRV, sleep stages, resting HR)
  const sleepDetailRes = await fetch(
    `https://api.ouraring.com/v2/usercollection/sleep?start_date=${startDate}&end_date=${endDate}`,
    { headers },
  );
  if (sleepDetailRes.ok) {
    const body = (await sleepDetailRes.json()) as {
      data: Array<{
        day: string;
        type?: string;
        total?: number;
        deep?: number;
        rem?: number;
        light?: number;
        average_heart_rate?: number;
        average_hrv?: number;
      }>;
    };
    for (const row of body.data ?? []) {
      if (row.type === "deleted") continue;
      if (row.total != null) await upsertMetric(userId, "oura", row.day, "sleep_total_seconds", row.total);
      if (row.deep != null) await upsertMetric(userId, "oura", row.day, "sleep_deep_seconds", row.deep);
      if (row.rem != null) await upsertMetric(userId, "oura", row.day, "sleep_rem_seconds", row.rem);
      if (row.light != null) await upsertMetric(userId, "oura", row.day, "sleep_light_seconds", row.light);
      if (row.average_heart_rate != null) await upsertMetric(userId, "oura", row.day, "resting_hr", row.average_heart_rate);
      if (row.average_hrv != null) await upsertMetric(userId, "oura", row.day, "hrv_avg_ms", row.average_hrv);
    }
  }

  // Readiness
  const readinessRes = await fetch(
    `https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${startDate}&end_date=${endDate}`,
    { headers },
  );
  if (readinessRes.ok) {
    const body = (await readinessRes.json()) as { data: Array<{ day: string; score?: number }> };
    for (const row of body.data ?? []) {
      if (row.score != null) await upsertMetric(userId, "oura", row.day, "readiness_score", row.score);
    }
  }

  // Activity
  const activityRes = await fetch(
    `https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${startDate}&end_date=${endDate}`,
    { headers },
  );
  if (activityRes.ok) {
    const body = (await activityRes.json()) as {
      data: Array<{ day: string; score?: number; steps?: number; active_calories?: number; total_calories?: number }>;
    };
    for (const row of body.data ?? []) {
      if (row.score != null) await upsertMetric(userId, "oura", row.day, "activity_score", row.score);
      if (row.steps != null) await upsertMetric(userId, "oura", row.day, "steps", row.steps);
      if (row.active_calories != null) await upsertMetric(userId, "oura", row.day, "active_calories", row.active_calories);
      if (row.total_calories != null) await upsertMetric(userId, "oura", row.day, "total_calories", row.total_calories);
    }
  }
}

// ── Whoop sync ───────────────────────────────────────────────────────────────

async function syncWhoopUser(userId: string, accessToken: string): Promise<void> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  // Recovery (HRV, resting HR, recovery score)
  const recoveryRes = await fetch(
    "https://api.prod.whoop.com/developer/v1/recovery/?limit=7&order=descending",
    { headers },
  );
  if (recoveryRes.ok) {
    const body = (await recoveryRes.json()) as {
      records: Array<{
        created_at?: string;
        score?: {
          recovery_score?: number;
          resting_heart_rate?: number;
          hrv_rmssd_milli?: number;
        };
      }>;
    };
    for (const rec of body.records ?? []) {
      const date = rec.created_at ? rec.created_at.split("T")[0]! : null;
      if (!date) continue;
      if (rec.score?.recovery_score != null) await upsertMetric(userId, "whoop", date, "recovery_score", rec.score.recovery_score);
      if (rec.score?.resting_heart_rate != null) await upsertMetric(userId, "whoop", date, "resting_hr", rec.score.resting_heart_rate);
      if (rec.score?.hrv_rmssd_milli != null) await upsertMetric(userId, "whoop", date, "hrv_ms", rec.score.hrv_rmssd_milli);
    }
  }

  // Sleep
  const sleepRes = await fetch(
    "https://api.prod.whoop.com/developer/v1/activity/sleep/?limit=7&order=descending",
    { headers },
  );
  if (sleepRes.ok) {
    const body = (await sleepRes.json()) as {
      records: Array<{
        end?: string;
        score?: {
          sleep_performance_percentage?: number;
          stage_summary?: {
            total_in_bed_time_milli?: number;
          };
        };
      }>;
    };
    for (const rec of body.records ?? []) {
      const date = rec.end ? rec.end.split("T")[0]! : null;
      if (!date) continue;
      if (rec.score?.sleep_performance_percentage != null) await upsertMetric(userId, "whoop", date, "sleep_performance", rec.score.sleep_performance_percentage);
    }
  }

  // Strain (cycles)
  const cycleRes = await fetch(
    "https://api.prod.whoop.com/developer/v1/cycle/?limit=7&order=descending",
    { headers },
  );
  if (cycleRes.ok) {
    const body = (await cycleRes.json()) as {
      records: Array<{
        days?: string[];
        score?: { strain?: number };
      }>;
    };
    for (const rec of body.records ?? []) {
      const date = rec.days?.[0] ?? null;
      if (!date) continue;
      if (rec.score?.strain != null) await upsertMetric(userId, "whoop", date, "strain_score", rec.score.strain);
    }
  }
}

// ── Main job ──────────────────────────────────────────────────────────────────

async function runWearableSync(): Promise<void> {
  const rows = await db
    .select({
      userId: wearableTokensTable.userId,
      source: wearableTokensTable.source,
    })
    .from(wearableTokensTable);

  if (rows.length === 0) return;
  logger.info({ userCount: rows.length }, "Wearable sync job starting");

  for (const { userId, source } of rows) {
    try {
      if (source === "oura") {
        const token = await refreshOuraToken(userId);
        if (!token) { logger.warn({ userId }, "Oura sync skipped — token unavailable"); continue; }
        await syncOuraUser(userId, token);
        logger.info({ userId }, "Oura sync complete");
      } else if (source === "whoop") {
        const token = await refreshWhoopToken(userId);
        if (!token) { logger.warn({ userId }, "Whoop sync skipped — token unavailable"); continue; }
        await syncWhoopUser(userId, token);
        logger.info({ userId }, "Whoop sync complete");
      }
      // Garmin is push-only — no pull needed here
    } catch (err) {
      logger.error({ err, userId, source }, "Wearable sync failed for user");
    }
  }
}

export function startWearableSyncJob(): void {
  let lastRunHour = -1;

  setInterval(() => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    if (EVEN_UTC_HOURS.has(utcHour) && lastRunHour !== utcHour) {
      lastRunHour = utcHour;
      logger.info({ utcHour }, "Wearable sync job triggered");
      void runWearableSync().catch((err: unknown) => {
        logger.error({ err }, "Wearable sync job error");
      });
    }
  }, SYNC_INTERVAL_MS);

  logger.info("Wearable sync job scheduled (every 2h UTC)");
}
