import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  fetchHRVForDate,
  fetchSleepHoursForDate,
  fetchRestingHeartRateForDate,
  fetchStepsForDate,
  fetchActiveCaloriesForDate,
  fetchRespiratoryRateForDate,
} from "./healthKit";

// v3: extended to include respiratory rate. Users who completed v2 will
// re-run automatically so the new field is backfilled. The upsert on the
// server is safe to call again — existing rows are updated, not duplicated.
export const BACKFILL_DONE_KEY = "@valo/healthkit-backfill-v3-done";
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
 * Backfills Apple Health data (HRV, sleep, resting HR, steps, active calories)
 * for every calendar day from BACKFILL_START through yesterday. Runs only once
 * per device per version — guarded by BACKFILL_DONE_KEY in AsyncStorage.
 * Intended to run silently in the background after the first successful
 * HealthKit sync so charts are populated on first use.
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
  // Track whether any POST ultimately failed after retries. The BACKFILL_DONE_KEY
  // is only written when every day with data was successfully uploaded, so a future
  // app launch will resume and retry any days that were missed.
  let hadPostFailure = false;

  while (current <= yesterday) {
    const dateStr = toLocalDateStr(current);
    try {
      const [hrv, sleepHours, restingHeartRate, steps, activeCalories, respiratoryRate] = await Promise.all([
        fetchHRVForDate(new Date(current)),
        fetchSleepHoursForDate(new Date(current)),
        fetchRestingHeartRateForDate(new Date(current)),
        fetchStepsForDate(new Date(current)),
        fetchActiveCaloriesForDate(new Date(current)),
        fetchRespiratoryRateForDate(new Date(current)),
      ]);

      const hasData =
        hrv !== null ||
        sleepHours !== null ||
        restingHeartRate !== null ||
        steps !== null ||
        activeCalories !== null ||
        respiratoryRate !== null;
      if (hasData) {
        const body: Record<string, unknown> = { date: dateStr };
        if (hrv !== null) body.hrv = hrv;
        if (sleepHours !== null) body.sleepHours = sleepHours;
        if (restingHeartRate !== null) body.restingHeartRate = restingHeartRate;
        if (steps !== null) body.steps = steps;
        if (activeCalories !== null) body.activeCalories = activeCalories;
        if (respiratoryRate !== null) body.respiratoryRate = respiratoryRate;

        let posted = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await fetch(`${getApiBase()}/api/daily-logs`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(body),
            });

            if (res.ok) {
              posted = true;
              break;
            }
            if (res.status === 401 || res.status === 403) {
              await handleUnauthorized();
              return;
            }
            // Server error — worth retrying
          } catch {
            // Network error — retry
          }
          if (attempt < 3) await sleep(INTER_REQUEST_DELAY_MS);
        }

        if (!posted) {
          hadPostFailure = true;
        } else {
          // Throttle successful uploads to avoid hammering the server
          await sleep(INTER_REQUEST_DELAY_MS);
        }
      }
    } catch {
      // HealthKit error for this day — skip without counting as a POST failure
    }

    current.setDate(current.getDate() + 1);
  }

  // Only mark done when all days with data were successfully uploaded.
  // If any POST failed, leave the flag unset so the next launch retries.
  if (!hadPostFailure) {
    await AsyncStorage.setItem(BACKFILL_DONE_KEY, "true");
  }
}
