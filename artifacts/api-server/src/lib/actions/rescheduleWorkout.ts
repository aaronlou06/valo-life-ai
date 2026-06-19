import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { db, calendarEventsTable } from "@workspace/db";
import type { ActionContext, ActionHandler, ProposalSummary } from "./registry";

/**
 * reschedule_workout — moves a scheduled workout to a new slot.
 *
 * DATA MODEL (confirmed against lib/db/src/schema/calendarEvents.ts and the
 * program attach handler in routes/workout.ts):
 *  - A scheduled workout in the Plan calendar IS a `calendar_events` row with
 *    `type = "workout"`. The attach flow keys these on `date` (YYYY-MM-DD) and
 *    typically leaves `startTime`/`endTime` null.
 *  - This handler mutates only that single `calendar_events` row. A
 *    `workout_sessions` row may reference the event via `calendarEventId`, but a
 *    session is a *logged instance* — it is intentionally NOT touched here.
 *
 * The `current*` parameters capture the slot at proposal time; Round 3's execute
 * endpoint uses them for a server-side freshness check before mutating.
 */

export const rescheduleWorkoutParamsSchema = z.object({
  calendarEventId: z.number().int(),
  /**
   * The workout's title, captured for a precise card summary (e.g. "Leg Day").
   * Optional + display-only: never used to authorize or mutate; the briefing
   * route may pass the live title through `propose()` to keep it fresh.
   */
  title: z.string().optional(),
  /** The workout's date (YYYY-MM-DD) at the time the proposal was made. */
  currentDate: z.string(),
  /** ISO timestamp of the workout's startTime at proposal time, or null. */
  currentStartTime: z.string().nullable().optional(),
  /** Target date (YYYY-MM-DD) to move the workout to. */
  targetDate: z.string(),
  /** ISO timestamp for the new startTime, or null to leave unscheduled by time. */
  targetStartTime: z.string().nullable().optional(),
  /** ISO timestamp for the new endTime, or null. */
  targetEndTime: z.string().nullable().optional(),
});

export type RescheduleWorkoutParams = z.infer<typeof rescheduleWorkoutParamsSchema>;

/** The prior slot captured before a move, used to reverse it on undo. */
export interface RescheduleWorkoutSnapshot {
  calendarEventId: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
}

function fmtDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return (
    " at " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  );
}

export const rescheduleWorkoutHandler: ActionHandler<
  RescheduleWorkoutParams,
  RescheduleWorkoutSnapshot
> = {
  type: "reschedule_workout",
  parameterSchema: rescheduleWorkoutParamsSchema,

  propose(parameters): ProposalSummary {
    const what = parameters.title?.trim() || "workout";
    const from = fmtDay(parameters.currentDate) + fmtTime(parameters.currentStartTime);
    const to = fmtDay(parameters.targetDate) + fmtTime(parameters.targetStartTime);
    return { actionSummary: `Move ${what} from ${from} to ${to}` };
  },

  async execute(
    parameters,
    ctx: ActionContext,
  ): Promise<{ beforeSnapshot: RescheduleWorkoutSnapshot }> {
    // Scope to owner + workout type so a stray/forged id cannot mutate another
    // user's event or a non-workout calendar entry.
    const ownedWorkout = and(
      eq(calendarEventsTable.id, parameters.calendarEventId),
      eq(calendarEventsTable.userId, ctx.userId),
      eq(calendarEventsTable.type, "workout"),
    );

    const [event] = await db
      .select()
      .from(calendarEventsTable)
      .where(ownedWorkout)
      .limit(1);

    if (!event) {
      throw new Error(
        `No workout calendar_events row ${parameters.calendarEventId} owned by user`,
      );
    }

    const beforeSnapshot: RescheduleWorkoutSnapshot = {
      calendarEventId: event.id,
      date: event.date,
      startTime: event.startTime ? event.startTime.toISOString() : null,
      endTime: event.endTime ? event.endTime.toISOString() : null,
    };

    await db
      .update(calendarEventsTable)
      .set({
        date: parameters.targetDate,
        startTime: parameters.targetStartTime ? new Date(parameters.targetStartTime) : null,
        endTime: parameters.targetEndTime ? new Date(parameters.targetEndTime) : null,
      })
      .where(ownedWorkout);

    return { beforeSnapshot };
  },

  async undo(beforeSnapshot, ctx: ActionContext): Promise<void> {
    await db
      .update(calendarEventsTable)
      .set({
        date: beforeSnapshot.date,
        startTime: beforeSnapshot.startTime ? new Date(beforeSnapshot.startTime) : null,
        endTime: beforeSnapshot.endTime ? new Date(beforeSnapshot.endTime) : null,
      })
      .where(
        and(
          eq(calendarEventsTable.id, beforeSnapshot.calendarEventId),
          eq(calendarEventsTable.userId, ctx.userId),
          eq(calendarEventsTable.type, "workout"),
        ),
      );
  },
};
