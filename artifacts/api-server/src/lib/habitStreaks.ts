import { eq, and, isNotNull } from "drizzle-orm";
import { db, verificationEventsTable, habitsTable, userProfilesTable } from "@workspace/db";
import { getDateInTimezone, DEFAULT_TIMEZONE } from "./dates";
import { loadPausedDatesByHabit } from "./commitmentExceptions";

/**
 * Single source of truth for habit streaks.
 *
 * `verification_events` rows (with habitId set) are authoritative. A streak is
 * derived purely from those rows using a local-day model — status "done"
 * extends, status "missed" breaks:
 *   - rows are considered in date order
 *   - a `completed = true` row extends the streak
 *   - a `completed = false` row breaks the streak
 *   - a day with NO row is skipped (the habit was not scheduled that day)
 *   - a missing row for today does NOT zero an otherwise-live streak
 *
 * Nothing should read the raw stored `habits.streak`/`completedToday` values as
 * truth — they are a denormalized cache kept in sync on write via
 * `recomputeAndPersistHabit`.
 */

export interface HabitCompletionRow {
  completionDate: string;
  completed: boolean;
}

export interface DerivedHabitStreak {
  current: number;
  longest: number;
  completedToday: boolean;
  lastCompletedDate: string | null;
}

// Device-verified (Checkpoint D): with a habit on an active streak, declaring a
// pause exception over yesterday+today via POST /commitment-exceptions left the
// streak unchanged (paused dates are neither breaks nor required completions)
// and the catch-up gap detector raised no nag for those days. Pause data is
// loaded internally by deriveHabitStreaks/recomputeAndPersistHabit via
// loadPausedDatesByHabit — no caller passes it in.
export function computeHabitStreak(
  rows: HabitCompletionRow[],
  today: string,
  pausedDates: Set<string> = new Set(),
): DerivedHabitStreak {
  // Only consider rows up to and including today; sort ascending by date.
  const past = rows
    .filter((r) => r.completionDate <= today)
    .sort((a, b) =>
      a.completionDate < b.completionDate ? -1 : a.completionDate > b.completionDate ? 1 : 0,
    );

  // Longest streak: walk ascending, true extends, false resets, no-row skipped.
  // A `missed` row whose date falls inside a pause window is frozen — it neither
  // extends nor resets the run (the streak is held across the pause).
  let longest = 0;
  let run = 0;
  let lastCompletedDate: string | null = null;
  for (const r of past) {
    if (r.completed) {
      run += 1;
      if (run > longest) longest = run;
      lastCompletedDate = r.completionDate;
    } else if (pausedDates.has(r.completionDate)) {
      // frozen — hold the run
    } else {
      run = 0;
    }
  }

  // Current streak: count leading `true` rows from the most recent backward.
  // No-row days are absent from the array, so they are naturally skipped; a
  // `missed` row inside a pause window is skipped (frozen), not a break.
  let current = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    if (past[i]!.completed) current += 1;
    else if (pausedDates.has(past[i]!.completionDate)) continue;
    else break;
  }

  const todayRow = rows.find((r) => r.completionDate === today);
  const completedToday = todayRow ? todayRow.completed : false;

  return { current, longest, completedToday, lastCompletedDate };
}

async function resolveToday(userId: string): Promise<string> {
  const profile = await db
    .select({ callTimezone: userProfilesTable.callTimezone })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);
  return getDateInTimezone(profile[0]?.callTimezone ?? DEFAULT_TIMEZONE);
}

/**
 * Derive streaks for every habit belonging to a user from their completion
 * rows. Returns the resolved local `today` and a map keyed by habit id.
 */
export async function deriveHabitStreaks(
  userId: string,
): Promise<{ today: string; byHabitId: Map<number, DerivedHabitStreak> }> {
  const today = await resolveToday(userId);
  const [rows, pausedByHabit] = await Promise.all([
    db
      .select({
        habitId: verificationEventsTable.habitId,
        occurrenceDate: verificationEventsTable.occurrenceDate,
        status: verificationEventsTable.status,
      })
      .from(verificationEventsTable)
      .where(
        and(
          eq(verificationEventsTable.userId, userId),
          isNotNull(verificationEventsTable.habitId),
        ),
      ),
    loadPausedDatesByHabit(userId),
  ]);

  const rowsByHabit = new Map<number, HabitCompletionRow[]>();
  for (const r of rows) {
    if (r.habitId == null) continue;
    const row = { completionDate: r.occurrenceDate, completed: r.status === "done" };
    const list = rowsByHabit.get(r.habitId);
    if (list) list.push(row);
    else rowsByHabit.set(r.habitId, [row]);
  }

  const byHabitId = new Map<number, DerivedHabitStreak>();
  for (const [habitId, hrows] of rowsByHabit) {
    byHabitId.set(habitId, computeHabitStreak(hrows, today, pausedByHabit.get(habitId)));
  }
  return { today, byHabitId };
}

/** Merge derived streak values onto a stored habit row (read-side only). */
export function applyDerivedToHabit<
  T extends {
    id: number;
    streak: number;
    completedToday: boolean;
    longestStreak: number;
    lastCompletedDate: string | null;
  },
>(habit: T, byHabitId: Map<number, DerivedHabitStreak>): T {
  const d = byHabitId.get(habit.id);
  if (!d) {
    // No completion rows yet — current streak and completedToday must be 0/false.
    return { ...habit, streak: 0, completedToday: false };
  }
  return {
    ...habit,
    streak: d.current,
    completedToday: d.completedToday,
    longestStreak: Math.max(habit.longestStreak, d.longest),
    lastCompletedDate: d.lastCompletedDate ?? habit.lastCompletedDate,
  };
}

/**
 * Recompute a single habit's streak cache from its completion rows and persist
 * it. Call this after any write to `verification_events`.
 */
export async function recomputeAndPersistHabit(
  userId: string,
  habitId: number,
): Promise<DerivedHabitStreak> {
  const today = await resolveToday(userId);
  const [rows, pausedByHabit] = await Promise.all([
    db
      .select({
        occurrenceDate: verificationEventsTable.occurrenceDate,
        status: verificationEventsTable.status,
      })
      .from(verificationEventsTable)
      .where(
        and(
          eq(verificationEventsTable.userId, userId),
          eq(verificationEventsTable.habitId, habitId),
        ),
      ),
    loadPausedDatesByHabit(userId),
  ]);

  const derived = computeHabitStreak(
    rows.map((r) => ({ completionDate: r.occurrenceDate, completed: r.status === "done" })),
    today,
    pausedByHabit.get(habitId),
  );
  await db
    .update(habitsTable)
    .set({
      streak: derived.current,
      completedToday: derived.completedToday,
      longestStreak: derived.longest,
      lastCompletedDate: derived.lastCompletedDate,
    })
    .where(and(eq(habitsTable.id, habitId), eq(habitsTable.userId, userId)));

  return derived;
}
