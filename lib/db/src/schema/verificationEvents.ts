import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { habitsTable } from "./habits";
import { routinesTable } from "./routines";

/**
 * Unified verification spine for recurring Verify items.
 *
 * A single row records that one recurring item (a habit OR a routine) was
 * verified for one occurrence date. Calendar events are Anchors and are NOT
 * verified here.
 *
 * Typed FKs (not a polymorphic itemType/itemId): exactly one of habitId /
 * routineId is set, enforced by a CHECK constraint, so referential integrity
 * holds and cascades are automatic.
 *
 *   - status: "done" | "missed" only. "assumed-done" is status=done with
 *     provenance=assumed — assumed never appears as a status.
 *   - provenance: how the event was captured —
 *       "confirmed" (user tapped/confirmed now),
 *       "recalled"  (reconciled later via catch-up),
 *       "assumed"   (system filled in without explicit confirmation).
 *   - occurrenceDate: the local YYYY-MM-DD the occurrence belongs to. For
 *     daily habits and routines this is the scheduled day. For flexible
 *     (weekly-target) habits it is the day the run actually happened.
 */
export const verificationEventsTable = pgTable(
  "verification_events",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    habitId: integer("habit_id").references(() => habitsTable.id, {
      onDelete: "cascade",
    }),
    routineId: text("routine_id").references(() => routinesTable.id, {
      onDelete: "cascade",
    }),
    occurrenceDate: text("occurrence_date").notNull(),
    status: text("status").notNull(),
    provenance: text("provenance").notNull().default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    exactlyOneTarget: check(
      "verification_events_exactly_one_target",
      sql`((case when ${t.habitId} is not null then 1 else 0 end) + (case when ${t.routineId} is not null then 1 else 0 end)) = 1`,
    ),
    statusValid: check(
      "verification_events_status_valid",
      sql`${t.status} in ('done', 'missed')`,
    ),
    provenanceValid: check(
      "verification_events_provenance_valid",
      sql`${t.provenance} in ('confirmed', 'recalled', 'assumed')`,
    ),
    habitOccUnique: uniqueIndex("verification_events_habit_occ_unique")
      .on(t.userId, t.habitId, t.occurrenceDate)
      .where(sql`${t.habitId} is not null`),
    routineOccUnique: uniqueIndex("verification_events_routine_occ_unique")
      .on(t.userId, t.routineId, t.occurrenceDate)
      .where(sql`${t.routineId} is not null`),
  }),
);

export type VerificationEvent = typeof verificationEventsTable.$inferSelect;
export type InsertVerificationEvent = typeof verificationEventsTable.$inferInsert;
