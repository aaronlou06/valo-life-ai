import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  fetchHRVForDate,
  fetchSleepHoursForDate,
  fetchRestingHeartRateForDate,
  fetchStepsForDate,
  fetchActiveCaloriesForDate,
  fetchRespiratoryRateForDate,
  HEALTHKIT_AUTHORIZED_DATE_KEY,
} from "./healthKit";

// v4: backfill start is now dynamic — anchored to the date HealthKit was first
// authorized on this device (stored in AsyncStorage) instead of a hardcoded
// calendar date. Users who completed v3 will re-run so their backfill
// window is corrected. The upsert on the server is safe to call again —
// existing rows are updated, not duplicated.
export const BACKFILL_DONE_KEY = "@valo/healthkit-backfill-v4-done";

// Fallback start when no stored authorization date exists (e.g. existing users
// who authorized before this key was written). 30 days is a reasonable window
// that covers recent history without iterating over hundreds of empty days.
const FALLBACK_DAYS = 30;
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

  // Determine backfill start: use the stored HealthKit authorization date when
  // available; otherwise fall back to FALLBACK_DAYS ago. Always truncate to
  // local midnight so per-day HealthKit windows align with the local calendar.
  // Do NOT parse the ISO string with new Date("YYYY-MM-DD") — that uses UTC
  // midnight and shifts the local calendar day in non-zero UTC-offset timezones.
  const storedAuthDate = await AsyncStorage.getItem(HEALTHKIT_AUTHORIZED_DATE_KEY);
  const backfillStart = new Date();
  if (storedAuthDate) {
    const parsed = new Date(storedAuthDate);
    backfillStart.setTime(isNaN(parsed.getTime()) ? Date.now() - FALLBACK_DAYS * 24 * 60 * 60 * 1000 : parsed.getTime());
  } else {
    backfillStart.setTime(Date.now() - FALLBACK_DAYS * 24 * 60 * 60 * 1000);
  }
  backfillStart.setHours(0, 0, 0, 0);

  // current starts at local midnight of the computed start date. setDate
  // increments in local time, so the local calendar day always matches the
  // dateStr we post to the server.
  const current = new Date(backfillStart);
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
