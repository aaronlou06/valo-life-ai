import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sharedCommitmentsTable } from "./sharedCommitments";

/**
 * commitment_exceptions — planned pauses / excused absences a user declares so
 * a buddy's view (and the streak math) does not read a gap as slipping.
 *
 *   - kind: 'pause' (paused, not expected to act) | 'excused' (sick/travel —
 *     absence is forgiven). Both keep a streak alive across the window.
 *   - startDate/endDate are inclusive YYYY-MM-DD local dates.
 *   - scope: 'one' (a single commitment, named inline via commitmentId) | 'all'
 *     (every active commitment) | 'several' (a subset — listed in
 *     commitment_exception_targets). Stage 0 ships UI for 'one' and 'all';
 *     'several' is schema-ready but UI-deferred.
 *   - commitmentId: the inline target for scope='one' (FK → shared_commitments);
 *     null for 'all' (covers everything) and 'several' (uses the junction table).
 *   - isRetroactive: auto-set server-side at write = (startDate < today). The
 *     activity feed badges these "noted retroactively" so history is never
 *     silently rewritten.
 *
 * The exception-aware streak function fetches these rows itself, so no caller
 * ever passes exceptions in — that kills the missed-caller class of bug.
 */
export const commitmentExceptionsTable = pgTable(
  "commitment_exceptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    commitmentId: integer("commitment_id").references(() => sharedCommitmentsTable.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    scope: text("scope").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    reason: text("reason"),
    isRetroactive: boolean("is_retroactive").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("commitment_exceptions_user_dates_idx").on(t.userId, t.startDate, t.endDate),
    check("commitment_exceptions_kind_valid", sql`${t.kind} in ('pause', 'excused')`),
    check(
      "commitment_exceptions_scope_valid",
      sql`${t.scope} in ('one', 'all', 'several')`,
    ),
  ],
);

export const insertCommitmentExceptionSchema = createInsertSchema(
  commitmentExceptionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCommitmentException = z.infer<typeof insertCommitmentExceptionSchema>;
export type CommitmentException = typeof commitmentExceptionsTable.$inferSelect;
