import { logger } from "./logger";

const INTERVAL_MS = 4 * 60 * 1000; // 4 minutes
const ACTIVE_HOURS_START = 8;       // 08:00 UTC
const ACTIVE_HOURS_END = 22;        // 22:00 UTC

function isActiveHour(): boolean {
  const hour = new Date().getUTCHours();
  return hour >= ACTIVE_HOURS_START && hour < ACTIVE_HOURS_END;
}

export function startKeepAlive(port: number): void {
  const url = `http://127.0.0.1:${port}/api/health`;

  const ping = async () => {
    if (!isActiveHour()) return;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        logger.warn({ status: res.status }, "keep-alive ping returned non-200");
      }
    } catch (err: unknown) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "keep-alive ping failed"
      );
    }
  };

  setInterval(() => {
    void ping();
  }, INTERVAL_MS);

  logger.info({ intervalMs: INTERVAL_MS, activeHoursUtc: `${ACTIVE_HOURS_START}–${ACTIVE_HOURS_END}` }, "keep-alive scheduler started");
}
