import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  fetchHRVForDate,
  fetchSleepHoursForDate,
  fetchRestingHeartRateForDate,
} from "./healthKit";

export const BACKFILL_DONE_KEY = "@valo/healthkit-backfill-done";
// Local-date start (month is 0-indexed): June 1, 2026 at local midnight.
// Do NOT use new Date("2026-06-01") — that parses as UTC midnight and causes
// per-day HealthKit windows to be anchored to the wrong local calendar day in
// timezones with a non-zero UTC offset.
const BACKFILL_START = new Date(2026, 5, 1);
const INTER_REQUEST_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

/** Formats a Date as YYYY-MM-DD using local calendar fields (timezone-safe). */
function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Backfills Apple Health data (HRV, sleep, resting HR) for every calendar day
 * from BACKFILL_START_DATE through yesterday. Runs only once per device — guarded
 * by the BACKFILL_DONE_KEY AsyncStorage flag. Intended to run silently in the
 * background after the first successful HealthKit sync so charts are populated
 * on first use.
 */
export async function runHealthKitBackfill(
  getToken: () => Promise<string | null>,
  handleUnauthorized: () => Promise<void>
): Promise<void> {
  if (Platform.OS !== "ios") return;

  const alreadyDone = await AsyncStorage.getItem(BACKFILL_DONE_KEY);
  if (alreadyDone) return;

  const token = await getToken();
  if (!token) return;

  // yesterday at local 23:59:59 — upper bound for the iteration.
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(23, 59, 59, 999);

  // current starts at local midnight June 1. setDate increments in local time,
  // so the local calendar day always matches the dateStr we post to the server.
  const current = new Date(BACKFILL_START);
  while (current <= yesterday) {
    const dateStr = toLocalDateStr(current);
    try {
      const [hrv, sleepHours, restingHeartRate] = await Promise.all([
        fetchHRVForDate(new Date(current)),
        fetchSleepHoursForDate(new Date(current)),
        fetchRestingHeartRateForDate(new Date(current)),
      ]);

      const hasData = hrv !== null || sleepHours !== null || restingHeartRate !== null;
      if (hasData) {
        const body: Record<string, unknown> = { date: dateStr };
        if (hrv !== null) body.hrv = hrv;
        if (sleepHours !== null) body.sleepHours = sleepHours;
        if (restingHeartRate !== null) body.restingHeartRate = restingHeartRate;

        const res = await fetch(`${getApiBase()}/api/daily-logs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });

        if (res.status === 401 || res.status === 403) {
          await handleUnauthorized();
          return;
        }
        // Non-auth server errors: skip this day and continue

        await sleep(INTER_REQUEST_DELAY_MS);
      }
    } catch {
      // Network error for this day — skip and continue
    }

    current.setDate(current.getDate() + 1);
  }

  await AsyncStorage.setItem(BACKFILL_DONE_KEY, "true");
}
