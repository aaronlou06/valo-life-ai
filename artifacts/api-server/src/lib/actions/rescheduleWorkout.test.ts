/**
 * Round-trip test for the reschedule_workout action handler.
 *
 * Verifies execute → undo restores the calendar_events row to its original slot.
 * Run with: pnpm --filter @workspace/api-server run test:actions
 *
 * Requires DATABASE_URL. Creates and cleans up a throwaway calendar_events row.
 */
import { eq } from "drizzle-orm";
import { db, calendarEventsTable, pool } from "@workspace/db";
import { getActionHandler } from "./index";

const TEST_USER = "__test_reschedule_workout__";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main(): Promise<void> {
  const handler = getActionHandler("reschedule_workout");
  assert(handler, "reschedule_workout handler should be registered");

  // Clean any leftover rows from a prior failed run.
  await db.delete(calendarEventsTable).where(eq(calendarEventsTable.userId, TEST_USER));

  const originalDate = "2026-06-23"; // Tuesday
  const originalStart = new Date("2026-06-23T18:00:00.000Z");
  const originalEnd = new Date("2026-06-23T19:00:00.000Z");

  const [created] = await db
    .insert(calendarEventsTable)
    .values({
      userId: TEST_USER,
      date: originalDate,
      title: "Leg Day",
      type: "workout",
      startTime: originalStart,
      endTime: originalEnd,
      notes: JSON.stringify({ programId: 1, templateId: 1 }),
      recurrenceType: "none",
    })
    .returning();

  assert(created, "test event should be created");
  const eventId = created!.id;

  try {
    const params = {
      calendarEventId: eventId,
      currentDate: originalDate,
      currentStartTime: originalStart.toISOString(),
      targetDate: "2026-06-25", // Thursday
      targetStartTime: "2026-06-25T18:00:00.000Z",
      targetEndTime: "2026-06-25T19:00:00.000Z",
    };

    const parsed = handler!.parameterSchema.parse(params);
    const ctx = { userId: TEST_USER };

    // ── Execute ──────────────────────────────────────────────────────────
    const { beforeSnapshot } = await handler!.execute(parsed, ctx);
    assert(
      (beforeSnapshot as { date: string }).date === originalDate,
      "snapshot should capture the original date",
    );

    const [afterMove] = await db
      .select()
      .from(calendarEventsTable)
      .where(eq(calendarEventsTable.id, eventId));
    assert(afterMove!.date === "2026-06-25", `expected moved date, got ${afterMove!.date}`);
    assert(
      afterMove!.startTime?.toISOString() === "2026-06-25T18:00:00.000Z",
      "startTime should be moved to Thursday",
    );

    // ── Undo ─────────────────────────────────────────────────────────────
    await handler!.undo(beforeSnapshot, ctx);

    const [afterUndo] = await db
      .select()
      .from(calendarEventsTable)
      .where(eq(calendarEventsTable.id, eventId));
    assert(afterUndo!.date === originalDate, `undo should restore date, got ${afterUndo!.date}`);
    assert(
      afterUndo!.startTime?.toISOString() === originalStart.toISOString(),
      "undo should restore startTime exactly",
    );
    assert(
      afterUndo!.endTime?.toISOString() === originalEnd.toISOString(),
      "undo should restore endTime exactly",
    );

    console.log("PASS: reschedule_workout execute → undo round-trip restores the original slot");

    // ── Negative: wrong user cannot mutate ────────────────────────────────
    let rejectedWrongUser = false;
    try {
      await handler!.execute(parsed, { userId: "__some_other_user__" });
    } catch {
      rejectedWrongUser = true;
    }
    assert(rejectedWrongUser, "execute should reject a wrong-user context");

    const [afterWrongUser] = await db
      .select()
      .from(calendarEventsTable)
      .where(eq(calendarEventsTable.id, eventId));
    assert(
      afterWrongUser!.date === originalDate,
      "wrong-user execute must not mutate the row",
    );
    console.log("PASS: reschedule_workout rejects wrong-user execution without mutating");

    // ── Negative: non-workout event is not mutated ────────────────────────
    await db
      .update(calendarEventsTable)
      .set({ type: "reminder" })
      .where(eq(calendarEventsTable.id, eventId));

    let rejectedNonWorkout = false;
    try {
      await handler!.execute(parsed, ctx);
    } catch {
      rejectedNonWorkout = true;
    }
    assert(rejectedNonWorkout, "execute should reject a non-workout event");

    const [afterNonWorkout] = await db
      .select()
      .from(calendarEventsTable)
      .where(eq(calendarEventsTable.id, eventId));
    assert(
      afterNonWorkout!.date === originalDate,
      "non-workout execute must not mutate the row",
    );
    console.log("PASS: reschedule_workout rejects non-workout events without mutating");
  } finally {
    await db.delete(calendarEventsTable).where(eq(calendarEventsTable.userId, TEST_USER));
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
