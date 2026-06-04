import { pgTable, serial, text, timestamp, real, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dailyLogsTable = pgTable("daily_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(),

  // Wearable / health metrics
  sleepHours: real("sleep_hours"),
  sleepScore: integer("sleep_score"),
  hrv: integer("hrv"),
  restingHeartRate: integer("resting_heart_rate"),
  steps: integer("steps"),
  activeCalories: integer("active_calories"),
  workoutType: text("workout_type"),
  workoutDuration: integer("workout_duration"),
  workoutEffort: integer("workout_effort"),
  workoutHrPeak: integer("workout_hr_peak"),
  recoveryScore: integer("recovery_score"),
  stressScore: integer("stress_score"),
  readinessScore: integer("readiness_score"),

  // Debrief-extracted fields (written by Claude after evening debrief)
  moodScore: integer("mood_score"),
  primaryEmotion: text("primary_emotion"),
  energyLevel: text("energy_level"),
  meaningfulConnection: boolean("meaningful_connection"),

  // Daily lifestyle logs
  waterOz: integer("water_oz"),
  mealsCount: integer("meals_count"),
  morningRoutineCompleted: boolean("morning_routine_completed"),
  sunlightLogged: boolean("sunlight_logged"),
  meditationLogged: boolean("meditation_logged"),
  focusSessionsCount: integer("focus_sessions_count"),
  focusSessionsTotalMinutes: integer("focus_sessions_total_minutes"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("daily_logs_user_date_idx").on(t.userId, t.date),
]);

export const insertDailyLogSchema = createInsertSchema(dailyLogsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyLog = z.infer<typeof insertDailyLogSchema>;
export type DailyLog = typeof dailyLogsTable.$inferSelect;
