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
      if (err) { resolve(null); return; }
      resolve(result?.value ?? null);
    });
  });
}

export async function fetchRestingHeartRate(): Promise<number | null> {
  if (!AppleHealthKit) return null;
  return new Promise((resolve) => {
    const options = { date: new Date().toISOString() };
    AppleHealthKit.getLatestRestingHeartRate(options, (err: any, result: any) => {
      if (err) { resolve(null); return; }
      resolve(result?.value ?? null);
    });
  });
}

export async function fetchHRV(): Promise<number | null> {
  if (!AppleHealthKit) return null;
  return new Promise((resolve) => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const options = {
      startDate: yesterday.toISOString(),
      endDate: now.toISOString(),
      ascending: false,
      limit: 1,
    };
    AppleHealthKit.getHeartRateVariabilitySamples(options, (err: any, results: any) => {
      if (err || !results?.length) { resolve(null); return; }
      resolve(results[0]?.value ?? null);
    });
  });
}

export async function fetchSleepHours(): Promise<number | null> {
  if (!AppleHealthKit) return null;
  return new Promise((resolve) => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(18, 0, 0, 0);
    const options = {
      startDate: yesterday.toISOString(),
      endDate: now.toISOString(),
    };
    AppleHealthKit.getSleepSamples(options, (err: any, results: any) => {
      if (err || !results?.length) { resolve(null); return; }
      const asleepSamples = results.filter(
        (s: any) =>
          s.value === "ASLEEP" ||
          s.value === "ASLEEP_CORE" ||
          s.value === "ASLEEP_DEEP" ||
          s.value === "ASLEEP_REM"
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
    const options = { date: new Date().toISOString() };
    AppleHealthKit.getActiveEnergyBurned(options, (err: any, result: any) => {
      if (err) { resolve(null); return; }
      resolve(result?.value ?? null);
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
