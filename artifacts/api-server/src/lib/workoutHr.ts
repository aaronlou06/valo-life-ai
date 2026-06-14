/**
 * Heart-rate session summary computation.
 *
 * Given a batch of captured HR samples and the user's profile, derives:
 *  - average and max BPM
 *  - seconds spent in each HR zone (rest, z1..z5) based on % of max HR
 *  - estimated energy expenditure (kcal) via the Keytel HR-based formula
 */

export type HrSampleInput = {
  bpm: number;
  sampledAt: Date;
};

export type HrZoneKey = "rest" | "z1" | "z2" | "z3" | "z4" | "z5";

export type HrSummary = {
  avgHr: number | null;
  maxHr: number | null;
  timeInZone: Record<string, number>;
  caloriesKcal: number | null;
  sampleCount: number;
};

// Lower bound (inclusive) of each zone as a fraction of max HR.
const ZONE_FLOORS: Array<{ key: HrZoneKey; floor: number }> = [
  { key: "z5", floor: 0.9 },
  { key: "z4", floor: 0.8 },
  { key: "z3", floor: 0.7 },
  { key: "z2", floor: 0.6 },
  { key: "z1", floor: 0.5 },
  { key: "rest", floor: 0 },
];

// Cap the duration credited to any single sample gap, so a dropout/reconnect
// does not over-attribute time to one zone.
const MAX_GAP_SEC = 10;

export function zoneForBpm(bpm: number, maxHr: number): HrZoneKey {
  if (maxHr <= 0) return "rest";
  const frac = bpm / maxHr;
  for (const z of ZONE_FLOORS) {
    if (frac >= z.floor) return z.key;
  }
  return "rest";
}

/** Estimate max HR from age when not explicitly set (classic 220 - age). */
export function estimateMaxHr(age: number | null | undefined): number {
  const a = typeof age === "number" && age > 0 ? age : 30;
  return Math.max(120, Math.round(220 - a));
}

/** Keytel et al. kcal per minute from instantaneous HR. */
function kcalPerMinute(
  bpm: number,
  age: number,
  weightKg: number,
  isFemale: boolean,
): number {
  const v = isFemale
    ? -20.4022 + 0.4472 * bpm - 0.1263 * weightKg + 0.074 * age
    : -55.0969 + 0.6309 * bpm + 0.1988 * weightKg + 0.2017 * age;
  return Math.max(0, v / 4.184);
}

export function summarizeHrSamples(
  samples: HrSampleInput[],
  maxHr: number,
  profile: { age?: number | null; weightKg?: number | null; biologicalSex?: string | null },
): HrSummary {
  const empty: Record<string, number> = {};
  if (samples.length === 0) {
    return { avgHr: null, maxHr: null, timeInZone: empty, caloriesKcal: null, sampleCount: 0 };
  }

  const sorted = [...samples].sort((a, b) => a.sampledAt.getTime() - b.sampledAt.getTime());

  let sum = 0;
  let max = 0;
  for (const s of sorted) {
    sum += s.bpm;
    if (s.bpm > max) max = s.bpm;
  }
  const avg = Math.round(sum / sorted.length);

  const age = typeof profile.age === "number" && profile.age > 0 ? profile.age : 30;
  const weightKg =
    typeof profile.weightKg === "number" && profile.weightKg > 0 ? profile.weightKg : 70;
  const isFemale = (profile.biologicalSex ?? "").toLowerCase().startsWith("f");

  const timeInZone: Record<string, number> = {};
  let calories = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i]!;
    const next = sorted[i + 1]!;
    const rawDt = (next.sampledAt.getTime() - cur.sampledAt.getTime()) / 1000;
    if (rawDt <= 0) continue;
    const dt = Math.min(rawDt, MAX_GAP_SEC);

    const zone = zoneForBpm(cur.bpm, maxHr);
    timeInZone[zone] = (timeInZone[zone] ?? 0) + dt;

    const avgBpm = (cur.bpm + next.bpm) / 2;
    calories += kcalPerMinute(avgBpm, age, weightKg, isFemale) * (dt / 60);
  }

  // Round zone seconds to whole integers.
  for (const k of Object.keys(timeInZone)) {
    timeInZone[k] = Math.round(timeInZone[k]!);
  }

  return {
    avgHr: avg,
    maxHr: max,
    timeInZone,
    caloriesKcal: Math.round(calories),
    sampleCount: sorted.length,
  };
}
