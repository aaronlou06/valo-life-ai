import { Platform, NativeModules } from "react-native";

let AppleHealthKit: any = null;

if (Platform.OS === "ios") {
  try {
    // react-native-health does `module.exports = Object.assign({}, NativeModules.AppleHealthKit, { Constants })`
    // Object.assign only copies own-enumerable props; if the native module exposes methods as
    // non-enumerable the spread silently loses them. Try the package export first, then fall back
    // to NativeModules.AppleHealthKit directly which always has the live method references.
    const mod = require("react-native-health");
    const fromPackage = mod?.default ?? mod;
    if (fromPackage && typeof fromPackage.initHealthKit === "function") {
      AppleHealthKit = fromPackage;
    } else {
      const native = NativeModules.AppleHealthKit;
      if (native && typeof native.initHealthKit === "function") {
        AppleHealthKit = native;
      }
    }
  } catch {
    // Native module absent (Expo Go without dev client, simulator without entitlement, etc.)
  }
}

export const HealthKitPermissions = {
  permissions: {
    read: [
      "HeartRateVariability",
      "RestingHeartRate",
      "HeartRate",
      "Steps",
      "SleepAnalysis",
      "ActiveEnergyBurned",
      "RespiratoryRate",
      "OxygenSaturation",
      "BodyMass",
      "Height",
    ],
    write: [],
  },
};

export type DailyHealthData = {
  sleepHours: number | null;
  hrv: number | null;
  restingHeartRate: number | null;
  steps: number | null;
  activeCalories: number | null;
  respiratoryRate: number | null;
};

export async function requestHealthKitPermissions(): Promise<boolean> {
  if (!AppleHealthKit) return false;

  const available: boolean = await new Promise((resolve) => {
    AppleHealthKit.isAvailable((err: any, result: boolean) => {
      resolve(!err && result);
    });
  });

  if (!available) return false;

  return new Promise((resolve) => {
    AppleHealthKit.initHealthKit(HealthKitPermissions, (err: any) => {
      resolve(!err);
    });
  });
}

export async function fetchSteps(): Promise<number | null> {
  if (!AppleHealthKit) return null;
  return new Promise((resolve) => {
    const options = {
      date: new Date().toISOString(),
      includeManuallyAdded: true,
    };
    AppleHealthKit.getStepCount(options, (err: any, result: any) => {
      if (err) { resolve(null); return; }
      resolve(result?.value ?? null);
    });
  });
}

export async function fetchRestingHeartRate(): Promise<number | null> {
  if (!AppleHealthKit) return null;
  return new Promise((resolve) => {
    // getRestingHeartRateSamples returns an array of discrete samples written
    // by Apple Watch during sleep. Look back 48 h so we capture last night's
    // reading regardless of what time of day the sync runs.
    const now = new Date();
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const options = {
      startDate: twoDaysAgo.toISOString(),
      endDate: now.toISOString(),
      ascending: false,
      limit: 1,
    };
    AppleHealthKit.getRestingHeartRateSamples(options, (err: any, results: any) => {
      if (err || !results?.length) { resolve(null); return; }
      resolve(Math.round(results[0].value));
    });
  });
}

export async function fetchHRV(): Promise<number | null> {
  if (!AppleHealthKit) return null;
  return new Promise((resolve) => {
    // HRV is measured during sleep and written by Apple Watch in the morning.
    // Look back 48 h so we always capture last night's reading regardless of
    // what time of day the sync runs.
    const now = new Date();
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const options = {
      startDate: twoDaysAgo.toISOString(),
      endDate: now.toISOString(),
      ascending: false,
      limit: 1,
    };
    AppleHealthKit.getHeartRateVariabilitySamples(options, (err: any, results: any) => {
      if (err || !results?.length) { resolve(null); return; }
      // HealthKit stores HRV (SDNN) in seconds; multiply by 1000 for milliseconds.
      // DB column is integer so round to nearest ms.
      const ms = Math.round((results[0].value ?? 0) * 1000);
      resolve(ms > 0 ? ms : null);
    });
  });
}

export async function fetchSleepHours(): Promise<number | null> {
  if (!AppleHealthKit) return null;
  return new Promise((resolve) => {
    // Sleep window: yesterday 6 pm → now. This captures a full overnight
    // session even for late sleepers. We look for ASLEEP_* stages (Apple
    // Watch sleep tracking) and fall back to the legacy ASLEEP category for
    // third-party apps and older watchOS versions.
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 1);
    windowStart.setHours(18, 0, 0, 0);
    const options = {
      startDate: windowStart.toISOString(),
      endDate: now.toISOString(),
    };
    AppleHealthKit.getSleepSamples(options, (err: any, results: any) => {
      if (err || !results?.length) { resolve(null); return; }

      // Sum only confirmed-asleep stages (exclude INBED / AWAKE).
      // The native library maps watchOS 9+ stages as "CORE", "DEEP", "REM"
      // (not "ASLEEP_CORE" etc.) and the legacy unified stage as "ASLEEP".
      const asleepSamples = results.filter(
        (s: any) =>
          s.value === "ASLEEP" ||
          s.value === "CORE" ||
          s.value === "DEEP" ||
          s.value === "REM"
      );

      const totalMs = asleepSamples.reduce((sum: number, s: any) => {
        const start = new Date(s.startDate).getTime();
        const end = new Date(s.endDate).getTime();
        return sum + (end - start);
      }, 0);
      const hours = totalMs / (1000 * 60 * 60);
      resolve(hours > 0 ? Math.round(hours * 10) / 10 : null);
    });
  });
}

export async function fetchActiveCalories(): Promise<number | null> {
  if (!AppleHealthKit) return null;
  return new Promise((resolve) => {
    // getActiveEnergyBurned returns an array of samples for the given range.
    // We want today's total, so query midnight → now and sum all sample values.
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const options = {
      startDate: midnight.toISOString(),
      endDate: now.toISOString(),
    };
    AppleHealthKit.getActiveEnergyBurned(options, (err: any, results: any) => {
      if (err || !results?.length) { resolve(null); return; }
      const total = results.reduce((sum: number, s: any) => sum + (s.value ?? 0), 0);
      resolve(total > 0 ? Math.round(total) : null);
    });
  });
}

export async function fetchHRVForDate(date: Date): Promise<number | null> {
  if (!AppleHealthKit) return null;
  return new Promise((resolve) => {
    // Apple Watch writes HRV overnight. Use a ±12h window around midnight of
    // the target date to reliably capture the reading regardless of write time.
    const midnight = new Date(date);
    midnight.setHours(0, 0, 0, 0);
    const options = {
      startDate: new Date(midnight.getTime() - 12 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(midnight.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      ascending: false,
      limit: 1,
    };
    AppleHealthKit.getHeartRateVariabilitySamples(options, (err: any, results: any) => {
      if (err || !results?.length) { resolve(null); return; }
      const ms = Math.round((results[0].value ?? 0) * 1000);
      resolve(ms > 0 ? ms : null);
    });
  });
}

export async function fetchRestingHeartRateForDate(date: Date): Promise<number | null> {
  if (!AppleHealthKit) return null;
  return new Promise((resolve) => {
    // Use a ±12h window around midnight of the target date.
    const midnight = new Date(date);
    midnight.setHours(0, 0, 0, 0);
    const options = {
      startDate: new Date(midnight.getTime() - 12 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(midnight.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      ascending: false,
      limit: 1,
    };
    AppleHealthKit.getRestingHeartRateSamples(options, (err: any, results: any) => {
      if (err || !results?.length) { resolve(null); return; }
      resolve(Math.round(results[0].value));
    });
  });
}

export async function fetchSleepHoursForDate(date: Date): Promise<number | null> {
  if (!AppleHealthKit) return null;
  return new Promise((resolve) => {
    // Sleep window: the evening before (18:00) → noon of the target date (12:00).
    // This captures a full overnight session anchored to the wake-up day.
    const targetMidnight = new Date(date);
    targetMidnight.setHours(0, 0, 0, 0);
    const options = {
      startDate: new Date(targetMidnight.getTime() - 6 * 60 * 60 * 1000).toISOString(),  // prior 18:00
      endDate: new Date(targetMidnight.getTime() + 12 * 60 * 60 * 1000).toISOString(),   // noon
    };
    AppleHealthKit.getSleepSamples(options, (err: any, results: any) => {
      if (err || !results?.length) { resolve(null); return; }
      const asleepSamples = results.filter(
        (s: any) =>
          s.value === "ASLEEP" ||
          s.value === "CORE" ||
          s.value === "DEEP" ||
          s.value === "REM"
      );
      const totalMs = asleepSamples.reduce((sum: number, s: any) => {
        const start = new Date(s.startDate).getTime();
        const end = new Date(s.endDate).getTime();
        return sum + (end - start);
      }, 0);
      const hours = totalMs / (1000 * 60 * 60);
      resolve(hours > 0 ? Math.round(hours * 10) / 10 : null);
    });
  });
}

export async function fetchTodayHealthData(): Promise<DailyHealthData> {
  const [sleepHours, hrv, restingHeartRate, steps, activeCalories] =
    await Promise.all([
      fetchSleepHours(),
      fetchHRV(),
      fetchRestingHeartRate(),
      fetchSteps(),
      fetchActiveCalories(),
    ]);
  return { sleepHours, hrv, restingHeartRate, steps, activeCalories, respiratoryRate: null };
}
