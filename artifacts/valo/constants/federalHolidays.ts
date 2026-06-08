export type HolidayLocale = "US" | "CA" | "UK" | "AU";

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
  const last = new Date(year, month + 1, 0);
  const dayOffset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - dayOffset);
}

/**
 * US-style observed date: Saturday → preceding Friday, Sunday → following Monday.
 * Used only for US federal holidays.
 */
function observed(year: number, month: number, day: number): Date {
  const d = new Date(year, month, day);
  const dow = d.getDay();
  if (dow === 6) return new Date(year, month, day - 1);
  if (dow === 0) return new Date(year, month, day + 1);
  return d;
}

/**
 * Forward-only observed date (used for CA, UK, AU):
 *   Saturday → following Monday (+2)
 *   Sunday   → following Monday (+1)
 * No backward shift — substitute days always land within the same or next week.
 */
function observedForward(year: number, month: number, day: number): Date {
  const d = new Date(year, month, day);
  const dow = d.getDay();
  if (dow === 6) return new Date(year, month, day + 2);
  if (dow === 0) return new Date(year, month, day + 1);
  return d;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * Computes Easter Sunday for the given year using the Anonymous Gregorian algorithm.
 */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

// ─── Christmas / Boxing Day helper (shared by UK and AU) ─────────────────────

function addChristmasHolidays(
  year: number,
  add: (name: string, d: Date) => void,
): void {
  const xmasDow = new Date(year, 11, 25).getDay();
  if (xmasDow === 6) {
    // Dec 25 Sat → Christmas observed Mon Dec 27, Boxing Day observed Tue Dec 28
    add("Christmas Day", new Date(year, 11, 27));
    add("Boxing Day", new Date(year, 11, 28));
  } else if (xmasDow === 0) {
    // Dec 25 Sun → Boxing Day Mon Dec 26, Christmas observed Tue Dec 27
    add("Boxing Day", new Date(year, 11, 26));
    add("Christmas Day", new Date(year, 11, 27));
  } else {
    add("Christmas Day", new Date(year, 11, 25));
    const dec26dow = new Date(year, 11, 26).getDay();
    const boxingDay =
      dec26dow === 6
        ? new Date(year, 11, 28)
        : dec26dow === 0
        ? new Date(year, 11, 27)
        : new Date(year, 11, 26);
    add("Boxing Day", boxingDay);
  }
}

// ─── US federal holidays ─────────────────────────────────────────────────────

/**
 * Computes all 11 US federal holidays for any given year.
 */
function computeHolidaysForYear_US(year: number): FederalHoliday[] {
  const holidays: FederalHoliday[] = [];
  const add = (name: string, d: Date) => holidays.push({ name, date: toIso(d) });

  add("New Year's Day", observed(year, 0, 1));
  add("Martin Luther King Jr. Day", nthWeekday(year, 0, MON, 3));
  add("Presidents' Day", nthWeekday(year, 1, MON, 3));
  add("Memorial Day", lastWeekday(year, 4, MON));
  add("Juneteenth", observed(year, 5, 19));
  add("Independence Day", observed(year, 6, 4));
  add("Labor Day", nthWeekday(year, 8, MON, 1));
  add("Columbus Day", nthWeekday(year, 9, MON, 2));
  add("Veterans Day", observed(year, 10, 11));
  add("Thanksgiving", nthWeekday(year, 10, THU, 4));
  add("Christmas Day", observed(year, 11, 25));

  return holidays.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ─── Canada federal holidays ─────────────────────────────────────────────────

function computeHolidaysForYear_CA(year: number): FederalHoliday[] {
  const holidays: FederalHoliday[] = [];
  const add = (name: string, d: Date) => holidays.push({ name, date: toIso(d) });

  add("New Year's Day", observedForward(year, 0, 1));
  add("Family Day", nthWeekday(year, 1, MON, 3));

  const easter = easterSunday(year);
  add("Good Friday", addDays(easter, -2));

  // Victoria Day: last Monday before May 25 (i.e. Monday preceding May 25)
  const may25dow = new Date(year, 4, 25).getDay();
  const victoriaOffset = may25dow === 1 ? 7 : may25dow === 0 ? 6 : may25dow - 1;
  add("Victoria Day", new Date(year, 4, 25 - victoriaOffset));

  add("Canada Day", observedForward(year, 6, 1));
  add("Civic Holiday", nthWeekday(year, 7, MON, 1));
  add("Labour Day", nthWeekday(year, 8, MON, 1));
  add("National Day for Truth and Reconciliation", new Date(year, 8, 30));
  add("Thanksgiving", nthWeekday(year, 9, MON, 2));
  add("Remembrance Day", observedForward(year, 10, 11));
  add("Christmas Day", observedForward(year, 11, 25));

  const dec26dow = new Date(year, 11, 26).getDay();
  const boxingDay =
    dec26dow === 6
      ? new Date(year, 11, 28)
      : dec26dow === 0
      ? new Date(year, 11, 27)
      : new Date(year, 11, 26);
  add("Boxing Day", boxingDay);

  return holidays.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ─── UK (England & Wales) bank holidays ──────────────────────────────────────

function computeHolidaysForYear_UK(year: number): FederalHoliday[] {
  const holidays: FederalHoliday[] = [];
  const add = (name: string, d: Date) => holidays.push({ name, date: toIso(d) });

  add("New Year's Day", observedForward(year, 0, 1));

  const easter = easterSunday(year);
  add("Good Friday", addDays(easter, -2));
  add("Easter Monday", addDays(easter, 1));

  add("Early May Bank Holiday", nthWeekday(year, 4, MON, 1));
  add("Spring Bank Holiday", lastWeekday(year, 4, MON));
  add("Summer Bank Holiday", lastWeekday(year, 7, MON));

  addChristmasHolidays(year, add);

  return holidays.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ─── Australia national public holidays ──────────────────────────────────────

function computeHolidaysForYear_AU(year: number): FederalHoliday[] {
  const holidays: FederalHoliday[] = [];
  const add = (name: string, d: Date) => holidays.push({ name, date: toIso(d) });

  add("New Year's Day", observedForward(year, 0, 1));

  // Australia Day: January 26 (Monday substitute if weekend)
  const jan26dow = new Date(year, 0, 26).getDay();
  add(
    "Australia Day",
    jan26dow === 6
      ? new Date(year, 0, 28)
      : jan26dow === 0
      ? new Date(year, 0, 27)
      : new Date(year, 0, 26),
  );

  const easter = easterSunday(year);
  add("Good Friday", addDays(easter, -2));
  add("Easter Saturday", addDays(easter, -1));
  add("Easter Monday", addDays(easter, 1));

  // Anzac Day: April 25 (Monday substitute if Sunday)
  const apr25dow = new Date(year, 3, 25).getDay();
  add("Anzac Day", apr25dow === 0 ? new Date(year, 3, 26) : new Date(year, 3, 25));

  // King's Birthday: 2nd Monday of June (national default; QLD and WA differ)
  add("King's Birthday", nthWeekday(year, 5, MON, 2));

  addChristmasHolidays(year, add);

  return holidays.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ─── Cache & dispatch ─────────────────────────────────────────────────────────

const cache = new Map<string, FederalHoliday[]>();

function holidaysForYear(year: number, locale: HolidayLocale = "US"): FederalHoliday[] {
  const key = `${locale}-${year}`;
  if (!cache.has(key)) {
    let computed: FederalHoliday[];
    switch (locale) {
      case "CA":
        computed = computeHolidaysForYear_CA(year);
        break;
      case "UK":
        computed = computeHolidaysForYear_UK(year);
        break;
      case "AU":
        computed = computeHolidaysForYear_AU(year);
        break;
      default:
        computed = computeHolidaysForYear_US(year);
    }
    cache.set(key, computed);
  }
  return cache.get(key)!;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getHolidaysForMonth(
  year: number,
  month: number,
  locale: HolidayLocale = "US",
): FederalHoliday[] {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const results = holidaysForYear(year, locale).filter((h) => h.date.startsWith(prefix));

  if (month === 11) {
    // December: next year's New Year's might be observed on Dec 31 of this year (US only)
    if (locale === "US") {
      const nextYearHolidays = holidaysForYear(year + 1, locale);
      const dec31 = `${year}-12-31`;
      for (const h of nextYearHolidays) {
        if (h.date === dec31 && !results.some((r) => r.date === dec31)) {
          results.push(h);
        }
      }
    }
  }

  return results.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function getHolidayForDate(
  dateStr: string,
  locale: HolidayLocale = "US",
): FederalHoliday | null {
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (isNaN(year)) return null;

  for (const y of [year - 1, year, year + 1]) {
    const found = holidaysForYear(y, locale).find((h) => h.date === dateStr);
    if (found) return found;
  }
  return null;
}

export function getUpcomingHoliday(
  withinDays = 30,
  locale: HolidayLocale = "US",
): (FederalHoliday & { daysAway: number }) | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + withinDays);

  const todayYear = today.getFullYear();
  const limitYear = limit.getFullYear();

  const candidates: FederalHoliday[] = [
    ...holidaysForYear(todayYear, locale),
    ...(limitYear > todayYear ? holidaysForYear(limitYear, locale) : []),
  ];

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

export const HOLIDAY_LOCALE_LABELS: Record<HolidayLocale, string> = {
  US: "United States",
  CA: "Canada",
  UK: "United Kingdom",
  AU: "Australia",
};
