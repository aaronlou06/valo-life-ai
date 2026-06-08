export interface FederalHoliday {
  name: string;
  date: string;
}

// Day-of-week constants (matches Date.prototype.getDay())
const MON = 1;
const THU = 4;

/**
 * Returns the date of the nth occurrence of `weekday` in the given month.
 * e.g. nthWeekday(2026, 0, MON, 3) → 3rd Monday of January 2026
 */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const dayOffset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + dayOffset + (n - 1) * 7);
}

/**
 * Returns the date of the last occurrence of `weekday` in the given month.
 * e.g. lastWeekday(2026, 4, MON) → last Monday of May 2026
 */
function lastWeekday(year: number, month: number, weekday: number): Date {
  // Start from the last day of the month and walk back
  const last = new Date(year, month + 1, 0);
  const dayOffset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - dayOffset);
}

/**
 * For fixed-date holidays (New Year's, Juneteenth, Independence Day,
 * Veterans Day, Christmas), returns the observed date when the actual
 * date falls on a weekend:
 *   Saturday → preceding Friday
 *   Sunday   → following Monday
 */
function observed(year: number, month: number, day: number): Date {
  const d = new Date(year, month, day);
  const dow = d.getDay();
  if (dow === 6) return new Date(year, month, day - 1); // Saturday → Friday
  if (dow === 0) return new Date(year, month, day + 1); // Sunday → Monday
  return d;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Computes all 11 US federal holidays for any given year, using the
 * statutory rules (fixed dates with observed-day shifts, nth-weekday
 * rules). Returns them sorted by observed date.
 *
 * Note: New Year's Day observed on the preceding Friday (Dec 31) is
 * included in the previous year's computation and also surfaces as part
 * of the new year's holiday set so callers querying either year see it.
 */
function computeHolidaysForYear(year: number): FederalHoliday[] {
  const holidays: FederalHoliday[] = [];

  const add = (name: string, d: Date) => {
    holidays.push({ name, date: toIso(d) });
  };

  // New Year's Day — January 1 (observed)
  // If observed date falls in previous December, include it anyway; callers
  // looking at Jan will still find it via getHolidaysForMonth for that year.
  add("New Year's Day", observed(year, 0, 1));

  // Martin Luther King Jr. Day — 3rd Monday of January
  add("Martin Luther King Jr. Day", nthWeekday(year, 0, MON, 3));

  // Presidents' Day (Washington's Birthday) — 3rd Monday of February
  add("Presidents' Day", nthWeekday(year, 1, MON, 3));

  // Memorial Day — last Monday of May
  add("Memorial Day", lastWeekday(year, 4, MON));

  // Juneteenth — June 19 (observed)
  add("Juneteenth", observed(year, 5, 19));

  // Independence Day — July 4 (observed)
  add("Independence Day", observed(year, 6, 4));

  // Labor Day — 1st Monday of September
  add("Labor Day", nthWeekday(year, 8, MON, 1));

  // Columbus Day — 2nd Monday of October
  add("Columbus Day", nthWeekday(year, 9, MON, 2));

  // Veterans Day — November 11 (observed)
  add("Veterans Day", observed(year, 10, 11));

  // Thanksgiving — 4th Thursday of November
  add("Thanksgiving", nthWeekday(year, 10, THU, 4));

  // Christmas Day — December 25 (observed)
  add("Christmas Day", observed(year, 11, 25));

  return holidays.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Simple year-keyed cache so we don't recompute on every call.
const cache = new Map<number, FederalHoliday[]>();

function holidaysForYear(year: number): FederalHoliday[] {
  if (!cache.has(year)) {
    cache.set(year, computeHolidaysForYear(year));
  }
  return cache.get(year)!;
}

export function getHolidaysForMonth(year: number, month: number): FederalHoliday[] {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;

  // New Year's observed on Dec 31 of the previous year: also check prev year
  const results = holidaysForYear(year).filter((h) => h.date.startsWith(prefix));

  if (month === 11) {
    // December: next year's New Year's might be observed on Dec 31 of this year
    const nextYearHolidays = holidaysForYear(year + 1);
    const dec31 = `${year}-12-31`;
    for (const h of nextYearHolidays) {
      if (h.date === dec31 && !results.some((r) => r.date === dec31)) {
        results.push(h);
      }
    }
  }

  return results.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function getHolidayForDate(dateStr: string): FederalHoliday | null {
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (isNaN(year)) return null;

  // Check the year of the date string, plus surrounding years for observed-day
  // shifts that land in an adjacent year (e.g. New Year's observed Dec 31).
  for (const y of [year - 1, year, year + 1]) {
    const found = holidaysForYear(y).find((h) => h.date === dateStr);
    if (found) return found;
  }
  return null;
}

export function getUpcomingHoliday(withinDays = 30): (FederalHoliday & { daysAway: number }) | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + withinDays);

  const todayYear = today.getFullYear();
  const limitYear = limit.getFullYear();

  const candidates: FederalHoliday[] = [
    ...holidaysForYear(todayYear),
    ...(limitYear > todayYear ? holidaysForYear(limitYear) : []),
  ];

  // Sort and find the first one in [today, limit]
  candidates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (const h of candidates) {
    const d = new Date(h.date + "T00:00:00");
    if (d >= today && d <= limit) {
      const daysAway = Math.round((d.getTime() - today.getTime()) / 86400000);
      return { ...h, daysAway };
    }
  }
  return null;
}

export const HOLIDAY_COLOR = "#C17B3F";
