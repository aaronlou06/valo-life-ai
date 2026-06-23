// This module MUST be imported at app root level (app/_layout.tsx) so that
// TaskManager.defineTask runs synchronously at module-load time, before any
// call to BackgroundFetch.registerTaskAsync. iOS will call the registered
// handler in a headless JS context whenever it fires the BGAppRefreshTask.

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

import { fetchTodayHealthData, fetchTodayWorkout } from "./healthKit";

export const HEALTHKIT_REFRESH_TASK = "com.valo.healthkit.refresh";

const BACKGROUND_FETCH_INTERVAL_SECS = 15 * 60; // 15 minutes

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

async function getStoredToken(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem("@valo/session");
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "token" in parsed) {
      const token = (parsed as Record<string, unknown>).token;
      return typeof token === "string" ? token : null;
    }
    return null;
  } catch {
    return null;
  }
}

// ── BGAppRefreshTask handler ─────────────────────────────────────────────────
// defineTask must be called synchronously at module evaluation time.

TaskManager.defineTask(HEALTHKIT_REFRESH_TASK, async () => {
  if (Platform.OS !== "ios") {
    return BackgroundFetch.BackgroundFetchResult.NoData;
  }

  try {
    const token = await getStoredToken();
    if (!token) return BackgroundFetch.BackgroundFetchResult.NoData;

    const [data, workout] = await Promise.all([
      fetchTodayHealthData(),
      fetchTodayWorkout().catch(() => null),
    ]);

    const hasData =
      data.sleepHours !== null ||
      data.hrv !== null ||
      data.restingHeartRate !== null ||
      data.steps !== null ||
      data.activeCalories !== null ||
      data.respiratoryRate !== null ||
      workout !== null;

    if (!hasData) return BackgroundFetch.BackgroundFetchResult.NoData;

    const body: Record<string, unknown> = {};
    if (data.sleepHours !== null) body.sleepHours = data.sleepHours;
    if (data.hrv !== null) body.hrv = data.hrv;
    if (data.restingHeartRate !== null) body.restingHeartRate = data.restingHeartRate;
    if (data.steps !== null) body.steps = Math.round(data.steps);
    if (data.activeCalories !== null) body.activeCalories = Math.round(data.activeCalories);
    if (data.respiratoryRate !== null) body.respiratoryRate = data.respiratoryRate;
    if (workout?.workoutType) body.workoutType = workout.workoutType;
    if (workout?.workoutDuration) body.workoutDuration = workout.workoutDuration;

    const res = await fetch(`${getApiBase()}/api/health/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    return res.ok
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.Failed;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ── enableBackgroundDelivery ─────────────────────────────────────────────────
// Registers HKObserverQuery for each key health type so HealthKit wakes the
// app as soon as new data is written (e.g. Apple Watch syncing after a workout
// or after the user wakes up). Frequency 1 = Immediate.

let AppleHealthKit: any = null;
if (Platform.OS === "ios") {
  try {
    const mod = require("react-native-health");
    AppleHealthKit = mod?.default ?? mod;
  } catch {
    // absent in Expo Go / web
  }
}

const OBSERVER_TYPES = [
  "HeartRateVariability",
  "RestingHeartRate",
  "SleepAnalysis",
  "Steps",
  "ActiveEnergyBurned",
];

function enableBackgroundDelivery(): void {
  if (!AppleHealthKit || typeof AppleHealthKit.enableBackgroundDelivery !== "function") return;
  for (const type of OBSERVER_TYPES) {
    AppleHealthKit.enableBackgroundDelivery(
      { type, frequency: 1 },
      (_err: unknown, _result: unknown) => {}
    );
  }
}

// ── Public registration function ─────────────────────────────────────────────
// Call once from useHealthKitSync after HealthKit permissions are granted.

let registered = false;

export async function registerBackgroundHealthSync(): Promise<void> {
  if (Platform.OS !== "ios") return;
  if (registered) return;
  registered = true;

  enableBackgroundDelivery();

  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Available ||
      status === BackgroundFetch.BackgroundFetchStatus.Restricted
    ) {
      await BackgroundFetch.registerTaskAsync(HEALTHKIT_REFRESH_TASK, {
        minimumInterval: BACKGROUND_FETCH_INTERVAL_SECS,
        stopOnTerminate: false,
        startOnBoot: false,
      });
    }
  } catch {
    // Already registered or unavailable — safe to ignore on repeat calls
  }
}
