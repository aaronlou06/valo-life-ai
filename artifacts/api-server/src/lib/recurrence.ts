/**
 * Server-side recurrence expansion for the Verify spine and catch-up.
 *
 * Ported from the mobile client's `recurrence.ts` so the server can derive the
 * occurrence dates a routine was scheduled on within a window. This is the
 * shared occurrence-derivation used by gap detection, catch-up, and (later)
 * voice — there is no second expansion path on the server.
 */

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(base.getDate() + n);
  return d;
}

export interface RoutineRecurrence {
  recurrenceType?: string | null;
  recurrenceInterval?: number | null;
  recurrenceEndDate?: string | null;
  days: number[];
}

/**
 * Generate the dates a routine is scheduled on within [windowStart, windowEnd],
 * respecting recurrenceType. Days are local YYYY-MM-DD strings.
 *
 * - none / weekly: dates that fall on any of `days` (0=Sun…6=Sat)
 * - daily:         every `recurrenceInterval` days (default 1)
 * - monthly:       once per calendar month, first matching day-of-week (or 1st)
 * - custom:        every `recurrenceInterval` days, filtered to `days` if set
 */
export function getRoutineOccurrences(
  routine: RoutineRecurrence,
  windowStart: Date,
  windowEnd: Date,
  skippedDates?: string[] | null,
): string[] {
  const skipped = new Set(skippedDates ?? []);
  const endCap = routine.recurrenceEndDate
    ? new Date(
        Math.min(
          new Date(routine.recurrenceEndDate + "T00:00:00").getTime(),
          windowEnd.getTime(),
        ),
      )
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
    let month = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1);
    while (month <= endCap) {
      if (daySet) {
        for (let day = 1; day <= 31; day++) {
          const candidate = new Date(month.getFullYear(), month.getMonth(), day);
          if (candidate.getMonth() !== month.getMonth()) break;
          if (
            daySet.has(candidate.getDay()) &&
            candidate >= windowStart &&
            candidate <= endCap
          ) {
            const ds = toISODate(candidate);
            if (!skipped.has(ds)) results.push(ds);
            break;
          }
        }
      } else {
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
