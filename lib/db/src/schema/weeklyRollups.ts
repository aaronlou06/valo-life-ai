import { pgTable, serial, text, real, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const weeklyRollupsTable = pgTable(
  "weekly_rollups",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    weekStart: text("week_start").notNull(),
    avgSteps: integer("avg_steps"),
    avgSleepHours: real("avg_sleep_hours"),
    avgHrvMs: real("avg_hrv_ms"),
    avgRestingHr: real("avg_resting_hr"),
    moodAvg: real("mood_avg"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("wr_user_week_uniq").on(table.userId, table.weekStart)],
);

export const insertWeeklyRollupSchema = createInsertSchema(weeklyRollupsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertWeeklyRollup = z.infer<typeof insertWeeklyRollupSchema>;
export type WeeklyRollup = typeof weeklyRollupsTable.$inferSelect;
