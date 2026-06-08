export const MAX_DAYS_OUT = 90;

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(base.getDate() + n);
  return d;
}

/**
 * Generate dates for a routine within an explicit window, respecting recurrenceType.
 *
 * - none / weekly: generates dates that fall on any of `days` (0=Sun…6=Sat)
 * - daily:         generates every `recurrenceInterval` days (default 1)
 * - monthly:       generates once per calendar month, on the first day that matches
 *                  any of `days` (or the 1st of the month when `days` is empty)
 * - custom:        generates every `recurrenceInterval` days, filtered to `days` if non-empty
 */
export function getRoutineOccurrences(
  routine: {
    recurrenceType?: string | null;
    recurrenceInterval?: number | null;
    recurrenceEndDate?: string | null;
    days: number[];
  },
  windowStart: Date,
  windowEnd: Date,
  skippedDates?: string[] | null,
): string[] {
  const skipped = new Set(skippedDates ?? []);
  const endCap = routine.recurrenceEndDate
    ? new Date(Math.min(new Date(routine.recurrenceEndDate + "T00:00:00").getTime(), windowEnd.getTime()))
    : windowEnd;

  const rType = routine.recurrenceType ?? "none";
  const results: string[] = [];

  if (rType === "daily") {
    const step = Math.max(1, routine.recurrenceInterval ?? 1);
    let d = new Date(windowStart);
    while (d <= endCap) {
      const ds = toISODate(d);
      if (!skipped.has(ds)) results.push(ds);
      d = addDays(d, step);
    }
    return results;
  }

  if (rType === "monthly") {
    const daySet = routine.days.length > 0 ? new Set(routine.days) : null;
    // Iterate month by month, find the first matching day-of-week in each month
    let month = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1);
    while (month <= endCap) {
      if (daySet) {
        // Find first day in this month that falls on a selected day-of-week
        for (let day = 1; day <= 31; day++) {
          const candidate = new Date(month.getFullYear(), month.getMonth(), day);
          // Stop if we've gone into the next month
          if (candidate.getMonth() !== month.getMonth()) break;
          if (daySet.has(candidate.getDay()) && candidate >= windowStart && candidate <= endCap) {
            const ds = toISODate(candidate);
            if (!skipped.has(ds)) results.push(ds);
            break;
          }
        }
      } else {
        // Default: 1st of the month
        const candidate = new Date(month.getFullYear(), month.getMonth(), 1);
        if (candidate >= windowStart && candidate <= endCap) {
          const ds = toISODate(candidate);
          if (!skipped.has(ds)) results.push(ds);
        }
      }
      month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    }
    return results;
  }

  if (rType === "custom") {
    const step = Math.max(1, routine.recurrenceInterval ?? 7);
    const daySet = routine.days.length > 0 ? new Set(routine.days) : null;
    let d = new Date(windowStart);
    while (d <= endCap) {
      if (!daySet || daySet.has(d.getDay())) {
        const ds = toISODate(d);
        if (!skipped.has(ds)) results.push(ds);
      }
      d = addDays(d, step);
    }
    return results;
  }

  // none / weekly: day-of-week based
  if (routine.days.length === 0) return [];
  const daySet = new Set(routine.days);
  let d = new Date(windowStart);
  while (d <= endCap) {
    if (daySet.has(d.getDay())) {
      const ds = toISODate(d);
      if (!skipped.has(ds)) results.push(ds);
    }
    d = addDays(d, 1);
  }
  return results;
}

/**
 * Generate all calendar-event recurrence occurrences from baseDate up to
 * MAX_DAYS_OUT days out (or recurrenceEndDate, whichever is sooner).
 * Supports daily, weekly, monthly, and custom (every N days).
 */
export function getRecurrenceOccurrences(
  baseDate: string,
  recurrenceType: string,
  recurrenceInterval: number | null | undefined,
  recurrenceEndDate: string | null | undefined,
  deletedOccurrences?: string[] | null,
): string[] {
  if (!recurrenceType || recurrenceType === "none") return [];

  const base = new Date(baseDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cap = addDays(today, MAX_DAYS_OUT);
  const end = recurrenceEndDate
    ? new Date(Math.min(new Date(recurrenceEndDate + "T00:00:00").getTime(), cap.getTime()))
    : cap;

  const deleted = new Set(deletedOccurrences ?? []);
  const results: string[] = [];

  let step: number;
  if (recurrenceType === "daily") {
    step = 1;
  } else if (recurrenceType === "weekly") {
    step = 7;
  } else if (recurrenceType === "monthly") {
    const dates: string[] = [];
    const baseDay = base.getDate();
    let d = new Date(base);
    while (d <= end) {
      const ds = toISODate(d);
      if (!deleted.has(ds)) dates.push(ds);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, baseDay);
      if (next <= d) break;
      d = next;
    }
    return dates;
  } else if (recurrenceType === "custom") {
    step = Math.max(1, recurrenceInterval ?? 1);
  } else {
    return [];
  }

  let d = new Date(base);
  while (d <= end) {
    const ds = toISODate(d);
    if (!deleted.has(ds)) results.push(ds);
    d = addDays(d, step);
  }
  return results;
}

/** Legacy helper — generates dates from `today` forward on given days-of-week. */
export function getDayOfWeekDates(days: number[], endDate?: string | null): string[] {
  if (days.length === 0) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cap = addDays(today, MAX_DAYS_OUT);
  const end = endDate
    ? new Date(Math.min(new Date(endDate + "T00:00:00").getTime(), cap.getTime()))
    : cap;
  const daySet = new Set(days);
  const results: string[] = [];
  let d = new Date(today);
  while (d <= end) {
    if (daySet.has(d.getDay())) results.push(toISODate(d));
    d = addDays(d, 1);
  }
  return results;
}
