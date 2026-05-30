import { pgTable, serial, text, real, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dailySummariesTable = pgTable(
  "daily_summaries",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    day: text("day").notNull(),
    steps: real("steps"),
    sleepHours: real("sleep_hours"),
    hrvMs: real("hrv_ms"),
    restingHr: real("resting_hr"),
    activeCalories: real("active_calories"),
    moodAvg: real("mood_avg"),
    habitCompletionRate: real("habit_completion_rate"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("ds_user_day_uniq").on(table.userId, table.day)],
);

export const insertDailySummarySchema = createInsertSchema(dailySummariesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertDailySummary = z.infer<typeof insertDailySummarySchema>;
export type DailySummary = typeof dailySummariesTable.$inferSelect;
