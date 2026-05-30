import { eq } from "drizzle-orm";
import { db, googleTokensTable } from "@workspace/db";
import { getValidAccessToken, syncCalendarEvents } from "../routes/google-oauth";
import { logger } from "./logger";

const SYNC_HOURS_UTC = new Set([0, 4, 8, 12, 16, 20]);
const POLL_INTERVAL_MS = 30 * 60 * 1000;

async function runCalendarSync(): Promise<void> {
  const rows = await db
    .select({ userId: googleTokensTable.userId })
    .from(googleTokensTable);

  if (rows.length === 0) return;

  logger.info({ userCount: rows.length }, "Calendar sync job starting");

  for (const { userId } of rows) {
    try {
      const accessToken = await getValidAccessToken(userId);
      if (!accessToken) {
        logger.warn({ userId }, "Calendar sync skipped — token refresh failed");
        continue;
      }
      await syncCalendarEvents(userId, accessToken);
      logger.info({ userId }, "Calendar sync complete");
    } catch (err) {
      logger.error({ err, userId }, "Calendar sync failed for user");
    }
  }
}

export function startCalendarSyncJob(): void {
  let lastRunHour = -1;

  setInterval(() => {
    const now = new Date();
    const utcHour = now.getUTCHours();

    if (SYNC_HOURS_UTC.has(utcHour) && lastRunHour !== utcHour) {
      lastRunHour = utcHour;
      logger.info({ utcHour }, "Calendar sync job triggered");
      void runCalendarSync().catch((err: unknown) => {
        logger.error({ err }, "Calendar sync job failed");
      });
    }
  }, POLL_INTERVAL_MS);

  logger.info("Calendar sync job scheduled (every 4h UTC: 0,4,8,12,16,20)");
}
