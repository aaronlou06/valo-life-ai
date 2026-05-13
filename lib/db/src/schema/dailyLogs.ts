import { pgTable, serial, text, timestamp, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dailyLogsTable = pgTable("daily_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(),
  sleepHours: real("sleep_hours"),
  hrv: integer("hrv"),
  restingHeartRate: integer("resting_heart_rate"),
  steps: integer("steps"),
  workoutType: text("workout_type"),
  workoutDuration: integer("workout_duration"),
  workoutEffort: integer("workout_effort"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDailyLogSchema = createInsertSchema(dailyLogsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyLog = z.infer<typeof insertDailyLogSchema>;
export type DailyLog = typeof dailyLogsTable.$inferSelect;
