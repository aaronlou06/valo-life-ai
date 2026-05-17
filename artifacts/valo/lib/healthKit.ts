import { Platform } from "react-native";
import {
  requestAuthorization,
  queryStatisticsForQuantity,
  queryCategorySamples,
} from "@kingstinct/react-native-healthkit";

export interface DailyHealthData {
  sleepHours: number | null;
  hrv: number | null;
  restingHeartRate: number | null;
  steps: number | null;
  activeCalories: number | null;
  respiratoryRate: number | null;
}

const READ_TYPES = [
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierRespiratoryRate",
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKQuantityTypeIdentifierHeartRate",
] as const;

export async function requestHealthKitPermissions(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    // v9: requestAuthorization(toShare, toRead)
    await requestAuthorization([], READ_TYPES);
    return true;
  } catch {
    return false;
  }
}

function todayFilter() {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  // v9: FilterForSamples has startDate/endDate directly (no nested "date" key)
  return { startDate, endDate };
}

async function fetchQuantityStat(
  identifier: (typeof READ_TYPES)[number],
  stat: "mostRecent" | "cumulativeSum" | "discreteAverage",
): Promise<number | null> {
  try {
    const result = await queryStatisticsForQuantity(
      identifier as "HKQuantityTypeIdentifierStepCount",
      [stat],
      { filter: todayFilter() },
    );
    if (!result) return null;
    const qty: { quantity?: number } | undefined =
      (result as any).mostRecentQuantity ??
      (result as any).sumQuantity ??
      (result as any).averageQuantity;
    if (!qty) return null;
    return typeof qty.quantity === "number" ? qty.quantity : null;
  } catch {
    return null;
  }
}

async function fetchSleepHours(): Promise<number | null> {
  if (Platform.OS !== "ios") return null;
  try {
    // v9: queryCategorySamples takes only the identifier — no options
    const samples = await queryCategorySamples("HKCategoryTypeIdentifierSleepAnalysis");

    if (!samples || samples.length === 0) return null;

    // Filter to samples starting from 6pm yesterday
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 1);
    cutoff.setHours(18, 0, 0, 0);
    const now = new Date();

    const ASLEEP_VALUES = new Set([1, 3, 4, 5]);
    let totalMs = 0;
    for (const s of samples) {
      const start = new Date(s.startDate).getTime();
      const end = new Date(s.endDate).getTime();
      if (
        ASLEEP_VALUES.has((s as any).value) &&
        start >= cutoff.getTime() &&
        end <= now.getTime() &&
        end > start
      ) {
        totalMs += end - start;
      }
    }
    if (totalMs === 0) return null;
    return Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10;
  } catch {
    return null;
  }
}

export async function fetchTodayHealthData(): Promise<DailyHealthData> {
  if (Platform.OS !== "ios") {
    return {
      sleepHours: null,
      hrv: null,
      restingHeartRate: null,
      steps: null,
      activeCalories: null,
      respiratoryRate: null,
    };
  }

  try {
    const [sleepHours, hrv, restingHeartRate, steps, activeCalories, respiratoryRate] =
      await Promise.all([
        fetchSleepHours(),
        fetchQuantityStat("HKQuantityTypeIdentifierHeartRateVariabilitySDNN", "mostRecent"),
        fetchQuantityStat("HKQuantityTypeIdentifierRestingHeartRate", "mostRecent"),
        fetchQuantityStat("HKQuantityTypeIdentifierStepCount", "cumulativeSum"),
        fetchQuantityStat("HKQuantityTypeIdentifierActiveEnergyBurned", "cumulativeSum"),
        fetchQuantityStat("HKQuantityTypeIdentifierRespiratoryRate", "mostRecent"),
      ]);

    return { sleepHours, hrv, restingHeartRate, steps, activeCalories, respiratoryRate };
  } catch {
    return {
      sleepHours: null,
      hrv: null,
      restingHeartRate: null,
      steps: null,
      activeCalories: null,
      respiratoryRate: null,
    };
  }
}
