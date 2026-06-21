import { and, eq, gte, lte } from "drizzle-orm";
import {
  db,
  habitsTable,
  routinesTable,
  verificationEventsTable,
  userProfilesTable,
} from "@workspace/db";
import { getDateInTimezone, DEFAULT_TIMEZONE } from "./dates";
import { getRoutineOccurrences } from "./recurrence";

/**
 * Catch-up / gap detection for the Verify spine.
 *
 * Looks back a bounded window over recurring Verify items (habits + routines —
 * calendar events are Anchors and excluded) and surfaces occurrences the user
 * has not yet verified, so they can reconcile them later. Reconciled events are
 * written with provenance "recalled" through the shared write path.
 *
 * Cadence handling:
 *   - daily habits (targetFrequency 7 or null): one cell per window day; an
 *     unverified past day is a pending gap.
 *   - routines: one cell per scheduled occurrence in the window.
 *   - flexible habits (targetFrequency < 7): a weekly-target roll-up ("X of N
 *     runs this week"), never per-day missed cells, and never a gap trigger.
 */

export const LOOKBACK_DAYS = 5;
// Minimum pending (daily habit + routine) occurrences before the Home card surfaces.
export const SURFACE_THRESHOLD = 2;

export type VerifyItemKind = "habit" | "routine";
export type CatchupCellStatus = "done" | "missed" | "pending";
export type CatchupCadence = "daily" | "flexible" | "routine";

export interface CatchupCell {
  date: string;
  status: CatchupCellStatus;
}

export interface CatchupWeekly {
  done: number;
  target: number;
  weekStart: string;
}

export interface CatchupItem {
  kind: VerifyItemKind;
  habitId: number | null;
  routineId: string | null;
  name: string;
  cadence: CatchupCadence;
  cells: CatchupCell[];
  weekly: CatchupWeekly | null;
}

export interface CatchupResult {
  today: string;
  lookbackDays: number;
  days: string[];
  items: CatchupItem[];
  pendingCount: number;
  hasGap: boolean;
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Monday-based start of the week containing `iso`, matching the recap week. */
function weekStartISO(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const dow = d.getDay(); // 0 Sun … 6 Sat
  const diff = (dow + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  return toISO(d);
}

function parseDays(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((n): n is number => typeof n === "number")
      : [];
  } catch {
    return [];
  }
}

function parseDateList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string")
      : [];
  } catch {
    return [];
  }
}

function isDailyHabit(targetFrequency: number | null): boolean {
  return targetFrequency == null || targetFrequency >= 7;
}

export async function buildCatchup(userId: string): Promise<CatchupResult> {
  const profile = await db
    .select({ callTimezone: userProfilesTable.callTimezone })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);
  const today = getDateInTimezone(profile[0]?.callTimezone ?? DEFAULT_TIMEZONE);

  // Window is the LOOKBACK_DAYS days *before* today (today is handled by the
  // normal Verify UI, not catch-up).
  const windowStart = addDaysISO(today, -LOOKBACK_DAYS);
  const windowEnd = addDaysISO(today, -1);
  const days: string[] = [];
  for (let i = LOOKBACK_DAYS; i >= 1; i--) days.push(addDaysISO(today, -i));

  const weekStart = weekStartISO(today);
  // Fetch all events from the earliest relevant date (window or week start) to today.
  const fetchStart = windowStart < weekStart ? windowStart : weekStart;

  const [habits, routines, events] = await Promise.all([
    db.select().from(habitsTable).where(eq(habitsTable.userId, userId)),
    db.select().from(routinesTable).where(eq(routinesTable.userId, userId)),
    db
      .select()
      .from(verificationEventsTable)
      .where(
        and(
          eq(verificationEventsTable.userId, userId),
          gte(verificationEventsTable.occurrenceDate, fetchStart),
          lte(verificationEventsTable.occurrenceDate, today),
        ),
      ),
  ]);

  const habitStatus = new Map<string, CatchupCellStatus>();
  const routineStatus = new Map<string, CatchupCellStatus>();
  const habitDoneInWeek = new Map<number, number>();
  for (const e of events) {
    const status: CatchupCellStatus = e.status === "done" ? "done" : "missed";
    if (e.habitId != null) {
      habitStatus.set(`${e.habitId}:${e.occurrenceDate}`, status);
      if (e.status === "done" && e.occurrenceDate >= weekStart) {
        habitDoneInWeek.set(e.habitId, (habitDoneInWeek.get(e.habitId) ?? 0) + 1);
      }
    } else if (e.routineId != null) {
      routineStatus.set(`${e.routineId}:${e.occurrenceDate}`, status);
    }
  }

  const items: CatchupItem[] = [];
  let pendingCount = 0;

  for (const h of habits) {
    if (isDailyHabit(h.targetFrequency)) {
      const cells: CatchupCell[] = days.map((date) => ({
        date,
        status: habitStatus.get(`${h.id}:${date}`) ?? "pending",
      }));
      const pending = cells.filter((c) => c.status === "pending").length;
      pendingCount += pending;
      items.push({
        kind: "habit",
        habitId: h.id,
        routineId: null,
        name: h.name,
        cadence: "daily",
        cells,
        weekly: null,
      });
    } else {
      items.push({
        kind: "habit",
        habitId: h.id,
        routineId: null,
        name: h.name,
        cadence: "flexible",
        cells: [],
        weekly: {
          done: habitDoneInWeek.get(h.id) ?? 0,
          target: h.targetFrequency ?? 1,
          weekStart,
        },
      });
    }
  }

  const windowStartDate = new Date(windowStart + "T00:00:00");
  const windowEndDate = new Date(windowEnd + "T00:00:00");
  for (const r of routines) {
    const occurrences = getRoutineOccurrences(
      {
        recurrenceType: r.recurrenceType,
        recurrenceInterval: r.recurrenceInterval,
        recurrenceEndDate: r.recurrenceEndDate,
        days: parseDays(r.days),
      },
      windowStartDate,
      windowEndDate,
      parseDateList(r.skippedDates),
    );
    if (occurrences.length === 0) continue;
    const cells: CatchupCell[] = occurrences.map((date) => ({
      date,
      status: routineStatus.get(`${r.id}:${date}`) ?? "pending",
    }));
    const pending = cells.filter((c) => c.status === "pending").length;
    pendingCount += pending;
    items.push({
      kind: "routine",
      habitId: null,
      routineId: r.id,
      name: r.name,
      cadence: "routine",
      cells,
      weekly: null,
    });
  }

  return {
    today,
    lookbackDays: LOOKBACK_DAYS,
    days,
    items,
    pendingCount,
    hasGap: pendingCount >= SURFACE_THRESHOLD,
  };
}
