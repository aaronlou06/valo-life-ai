import { and, eq } from "drizzle-orm";
import { db, verificationEventsTable, type VerificationEvent } from "@workspace/db";
import { recomputeAndPersistHabit } from "./habitStreaks";

/**
 * The ONE shared write path for verification events (Verify spine).
 *
 * Every surface that records a habit or routine as done/missed — the manual
 * Plan tap, the catch-up reconciliation grid, and (later) voice — must go
 * through this module. There is deliberately no second write path.
 */

export type VerificationStatus = "done" | "missed";
export type VerificationProvenance = "confirmed" | "recalled" | "assumed";

export type VerifyItemRef = { habitId: number } | { routineId: string };

export interface RecordVerificationParams {
  userId: string;
  item: VerifyItemRef;
  occurrenceDate: string;
  status: VerificationStatus;
  provenance?: VerificationProvenance;
}

function isHabitRef(item: VerifyItemRef): item is { habitId: number } {
  return (item as { habitId?: number }).habitId != null;
}

/**
 * Upsert a single verification event for one item on one occurrence date.
 * Idempotent on (userId, item, occurrenceDate): a repeat write updates the
 * existing row's status/provenance rather than creating a duplicate.
 *
 * For habits this also recomputes the cached streak/completedToday so the
 * habits cache never drifts from the spine.
 */
export async function recordVerificationEvent(
  params: RecordVerificationParams,
): Promise<VerificationEvent> {
  const { userId, item, occurrenceDate, status } = params;
  const provenance = params.provenance ?? "confirmed";
  const isHabit = isHabitRef(item);
  const habitId = isHabit ? item.habitId : null;
  const routineId = isHabit ? null : (item as { routineId: string }).routineId;

  const matchTarget = isHabit
    ? eq(verificationEventsTable.habitId, habitId!)
    : eq(verificationEventsTable.routineId, routineId!);

  const existing = await db
    .select()
    .from(verificationEventsTable)
    .where(
      and(
        eq(verificationEventsTable.userId, userId),
        matchTarget,
        eq(verificationEventsTable.occurrenceDate, occurrenceDate),
      ),
    )
    .limit(1);

  let row: VerificationEvent;
  if (existing.length > 0) {
    const [updated] = await db
      .update(verificationEventsTable)
      .set({ status, provenance })
      .where(eq(verificationEventsTable.id, existing[0]!.id))
      .returning();
    row = updated!;
  } else {
    const [created] = await db
      .insert(verificationEventsTable)
      .values({ userId, habitId, routineId, occurrenceDate, status, provenance })
      .returning();
    row = created!;
  }

  if (isHabit) {
    await recomputeAndPersistHabit(userId, habitId!);
  }

  return row;
}

/**
 * Clear (delete) a verification event, returning an item to the pending state.
 * Used by the manual toggle to undo back to "not yet verified" (which is
 * distinct from an explicit "missed").
 */
export async function clearVerificationEvent(
  userId: string,
  item: VerifyItemRef,
  occurrenceDate: string,
): Promise<void> {
  const isHabit = isHabitRef(item);
  const matchTarget = isHabit
    ? eq(verificationEventsTable.habitId, item.habitId)
    : eq(verificationEventsTable.routineId, (item as { routineId: string }).routineId);

  await db
    .delete(verificationEventsTable)
    .where(
      and(
        eq(verificationEventsTable.userId, userId),
        matchTarget,
        eq(verificationEventsTable.occurrenceDate, occurrenceDate),
      ),
    );

  if (isHabit) {
    await recomputeAndPersistHabit(userId, item.habitId);
  }
}

/**
 * Manual one-tap toggle for a habit, preserving the legacy semantics the Plan
 * UI relies on: an untouched habit becomes done; a done habit flips to missed;
 * a missed habit flips back to done. Always routes through the shared write
 * path above.
 */
export async function toggleHabitVerification(
  userId: string,
  habitId: number,
  occurrenceDate: string,
): Promise<VerificationEvent> {
  const existing = await db
    .select()
    .from(verificationEventsTable)
    .where(
      and(
        eq(verificationEventsTable.userId, userId),
        eq(verificationEventsTable.habitId, habitId),
        eq(verificationEventsTable.occurrenceDate, occurrenceDate),
      ),
    )
    .limit(1);

  const nextStatus: VerificationStatus =
    existing.length > 0 && existing[0]!.status === "done" ? "missed" : "done";

  return recordVerificationEvent({
    userId,
    item: { habitId },
    occurrenceDate,
    status: nextStatus,
    provenance: "confirmed",
  });
}

/**
 * Legacy-compatible shape consumed by the mobile client (progress + plan).
 * Sourced from verification_events so the spine is the single source of truth.
 */
export interface HabitCompletionView {
  id: number;
  habitId: number;
  userId: string;
  completionDate: string;
  completed: boolean;
  createdAt: string;
}

function toCompletionView(row: VerificationEvent): HabitCompletionView {
  return {
    id: row.id,
    habitId: row.habitId!,
    userId: row.userId,
    completionDate: row.occurrenceDate,
    completed: row.status === "done",
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

/** List a user's habit verification events for a date, in the legacy shape. */
export async function listHabitVerificationsForDate(
  userId: string,
  date: string,
): Promise<HabitCompletionView[]> {
  const rows = await db
    .select()
    .from(verificationEventsTable)
    .where(
      and(
        eq(verificationEventsTable.userId, userId),
        eq(verificationEventsTable.occurrenceDate, date),
      ),
    );
  return rows.filter((r) => r.habitId != null).map(toCompletionView);
}
