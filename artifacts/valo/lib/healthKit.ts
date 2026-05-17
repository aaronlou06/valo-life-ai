export type DailyHealthData = {
  sleepHours: number | null
  hrv: number | null
  restingHeartRate: number | null
  steps: number | null
  activeCalories: number | null
}

export async function requestHealthKitPermissions(): Promise<boolean> {
  return false
}

export async function fetchTodayHealthData(): Promise<DailyHealthData> {
  return {
    sleepHours: null,
    hrv: null,
    restingHeartRate: null,
    steps: null,
    activeCalories: null,
  }
}
