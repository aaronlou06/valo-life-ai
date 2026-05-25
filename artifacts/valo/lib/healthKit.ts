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
  console.log('[HealthKit] requestPermissions called, AppleHealthKit:', !!AppleHealthKit);
  if (!AppleHealthKit) return false;

  const available: boolean = await new Promise((resolve) => {
    AppleHealthKit.isAvailable((err: any, result: boolean) => {
      console.log('[HealthKit] isAvailable err:', err, 'result:', result);
      resolve(!err && result);
    });
  });

  if (!available) {
    console.log('[HealthKit] HealthKit not available on this device');
    return false;
  }

  return new Promise((resolve) => {
    console.log('[HealthKit] initHealthKit called');
    AppleHealthKit.initHealthKit(HealthKitPermissions, (err: any) => {
      if (err) {
        console.log('[HealthKit] initHealthKit error:', JSON.stringify(err));
        resolve(false);
      } else {
        console.log('[HealthKit] initHealthKit success');
        resolve(true);
      }
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
      if (err) {
        console.log('[HealthKit] getStepCount error:', JSON.stringify(err));
        resolve(null);
        return;
      }
      console.log('[HealthKit] getStepCount raw:', JSON.stringify(result));
      resolve(result?.value ?? null);
    });
  });
}

export async function fetchRestingHeartRate(): Promise<number | null> {
  if (!AppleHealthKit) return null;
  return new Promise((resolve) => {
    // getRestingHeartRate returns an array of samples — newest first when
    // ascending: false. We want the most recent reading, which is typically
    // last night's Apple Watch measurement. Look back 48 h to account for
    // days when the watch wasn't worn overnight.
    const now = new Date();
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const options = {
      startDate: twoDaysAgo.toISOString(),
      endDate: now.toISOString(),
      ascending: false,
      limit: 1,
    };
    AppleHealthKit.getRestingHeartRate(options, (err: any, results: any) => {
      if (err) {
        console.log('[HealthKit] getRestingHeartRate error:', JSON.stringify(err));
        resolve(null);
        return;
      }
      console.log('[HealthKit] getRestingHeartRate raw:', JSON.stringify(results));
      // Some versions return a single object, others return an array.
      if (Array.isArray(results)) {
        resolve(results[0]?.value ?? null);
      } else {
        resolve(results?.value ?? null);
      }
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
      if (err) {
        console.log('[HealthKit] getHeartRateVariabilitySamples error:', JSON.stringify(err));
        resolve(null);
        return;
      }
      console.log('[HealthKit] getHeartRateVariabilitySamples raw:', JSON.stringify(results));
      if (!results?.length) { resolve(null); return; }
      resolve(results[0]?.value ?? null);
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
      if (err) {
        console.log('[HealthKit] getSleepSamples error:', JSON.stringify(err));
        resolve(null);
        return;
      }
      console.log('[HealthKit] getSleepSamples raw count:', results?.length ?? 0, 'first:', JSON.stringify(results?.[0]));
      if (!results?.length) { resolve(null); return; }

      // Sum only confirmed-asleep stages (exclude INBED / AWAKE).
      const asleepSamples = results.filter(
        (s: any) =>
          s.value === "ASLEEP" ||
          s.value === "ASLEEP_CORE" ||
          s.value === "ASLEEP_DEEP" ||
          s.value === "ASLEEP_REM"
      );
      console.log('[HealthKit] getSleepSamples asleep count:', asleepSamples.length);

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
      if (err) {
        console.log('[HealthKit] getActiveEnergyBurned error:', JSON.stringify(err));
        resolve(null);
        return;
      }
      console.log('[HealthKit] getActiveEnergyBurned raw count:', results?.length ?? 0);
      if (!results?.length) { resolve(null); return; }
      const total = results.reduce((sum: number, s: any) => sum + (s.value ?? 0), 0);
      resolve(total > 0 ? Math.round(total) : null);
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
