import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * shared_commitments — a commitment a user opts into accountability for.
 *
 * References the existing habit/goal rather than duplicating their tracking.
 * Stage 0 surfaces only habit-backed commitments in the create flow, but the
 * sourceType enum keeps goal/standalone schema-ready for later stages.
 *
 *   - sourceType: 'habit' | 'goal' | 'standalone'. sourceId points into the
 *     corresponding table (habits.id for 'habit'); null for 'standalone'.
 *   - metricType: 'binary' (did/didn't) | 'count' (X times) | 'streak'. All are
 *     process-shaped by design — never an outcome number (weight/calories) a
 *     buddy could read competitively.
 *   - cadence: 'daily' | 'weekly' | 'custom'. cadenceDaysPerWeek is set only
 *     for weekly cadence (e.g. 3 for "3x/week").
 */
export const sharedCommitmentsTable = pgTable(
  "shared_commitments",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    sourceType: text("source_type").notNull(),
    sourceId: integer("source_id"),
    metricType: text("metric_type").notNull(),
    cadence: text("cadence").notNull(),
    cadenceDaysPerWeek: integer("cadence_days_per_week"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("shared_commitments_user_active_idx").on(t.userId, t.isActive),
    check(
      "shared_commitments_source_type_valid",
      sql`${t.sourceType} in ('habit', 'goal', 'standalone')`,
    ),
    check(
      "shared_commitments_metric_type_valid",
      sql`${t.metricType} in ('binary', 'count', 'streak')`,
    ),
    check(
      "shared_commitments_cadence_valid",
      sql`${t.cadence} in ('daily', 'weekly', 'custom')`,
    ),
  ],
);

export const insertSharedCommitmentSchema = createInsertSchema(sharedCommitmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSharedCommitment = z.infer<typeof insertSharedCommitmentSchema>;
export type SharedCommitment = typeof sharedCommitmentsTable.$inferSelect;
