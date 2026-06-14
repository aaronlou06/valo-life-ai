/**
 * Heart-rate domain helpers — pure, no BLE/native imports so this is safe to
 * use on web and in tests. The BLE plumbing lives in HeartRateContext.
 */

// Standard Bluetooth GATT Heart Rate Service + Measurement characteristic.
export const HEART_RATE_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb";
export const HEART_RATE_MEASUREMENT_UUID = "00002a37-0000-1000-8000-00805f9b34fb";

export type HrZoneKey = "rest" | "z1" | "z2" | "z3" | "z4" | "z5";

export type HrZone = {
  key: HrZoneKey;
  label: string;
  /** Inclusive lower bound as a fraction of max HR. */
  floor: number;
  color: string;
};

// Warm amber -> terracotta progression to match the Valo palette.
export const HR_ZONES: HrZone[] = [
  { key: "rest", label: "Rest", floor: 0, color: "#A89B8C" },
  { key: "z1", label: "Zone 1 - Warm up", floor: 0.5, color: "#DDB278" },
  { key: "z2", label: "Zone 2 - Easy", floor: 0.6, color: "#C9924E" },
  { key: "z3", label: "Zone 3 - Aerobic", floor: 0.7, color: "#C17B3F" },
  { key: "z4", label: "Zone 4 - Threshold", floor: 0.8, color: "#A85638" },
  { key: "z5", label: "Zone 5 - Max", floor: 0.9, color: "#8C3B2E" },
];

export const HR_ZONE_KEYS: HrZoneKey[] = ["rest", "z1", "z2", "z3", "z4", "z5"];

export function zoneForBpm(bpm: number, maxHr: number): HrZone {
  if (maxHr <= 0) return HR_ZONES[0]!;
  const frac = bpm / maxHr;
  let chosen = HR_ZONES[0]!;
  for (const z of HR_ZONES) {
    if (frac >= z.floor) chosen = z;
  }
  return chosen;
}

/** Classic age-based max HR estimate (220 - age). */
export function estimateMaxHr(age: number | null | undefined): number {
  const a = typeof age === "number" && age > 0 ? age : 30;
  return Math.max(120, Math.round(220 - a));
}

/**
 * Parse a Heart Rate Measurement characteristic value.
 * Byte 0 = flags. Bit 0 indicates the BPM value format:
 *   0 -> uint8 at byte 1
 *   1 -> uint16 (little-endian) at bytes 1-2
 * Returns null if the buffer is too short to contain a value.
 */
export function parseHeartRateMeasurement(bytes: Uint8Array): number | null {
  if (bytes.length < 2) return null;
  const flags = bytes[0]!;
  const is16Bit = (flags & 0x01) === 0x01;
  if (is16Bit) {
    if (bytes.length < 3) return null;
    return bytes[1]! | (bytes[2]! << 8);
  }
  return bytes[1]!;
}

/** Decode a base64 characteristic payload (as react-native-ble-plx returns) into bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  // Minimal base64 decoder that works without Buffer/atob on native.
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const e0 = chars.indexOf(clean[i]!);
    const e1 = chars.indexOf(clean[i + 1]!);
    const e2 = clean[i + 2] ? chars.indexOf(clean[i + 2]!) : -1;
    const e3 = clean[i + 3] ? chars.indexOf(clean[i + 3]!) : -1;
    const c0 = (e0 << 2) | (e1 >> 4);
    out.push(c0 & 0xff);
    if (e2 !== -1) {
      const c1 = ((e1 & 0x0f) << 4) | (e2 >> 2);
      out.push(c1 & 0xff);
    }
    if (e3 !== -1) {
      const c2 = ((e2 & 0x03) << 6) | e3;
      out.push(c2 & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export type HrSample = { bpm: number; sampledAt: string };

export type HrLiveStats = {
  current: number | null;
  avg: number | null;
  max: number | null;
};

export function computeLiveStats(samples: HrSample[]): HrLiveStats {
  if (samples.length === 0) return { current: null, avg: null, max: null };
  let sum = 0;
  let max = 0;
  for (const s of samples) {
    sum += s.bpm;
    if (s.bpm > max) max = s.bpm;
  }
  return {
    current: samples[samples.length - 1]!.bpm,
    avg: Math.round(sum / samples.length),
    max,
  };
}

export function fmtZoneSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
