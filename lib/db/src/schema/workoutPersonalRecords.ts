import { pgTable, serial, text, timestamp, integer, real, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workoutSessionsTable } from "./workoutSessions";
import { exercisesTable } from "./exercises";

// One row per (userId, exerciseId, metricType) — always the current all-time best.
// metricType values:
//   '1rm_kg'       — estimated 1-rep-max in kg (Epley formula)
//   'duration_sec' — longest single set duration in seconds
//   'distance_m'   — longest single set distance in metres
export const workoutPersonalRecordsTable = pgTable("workout_personal_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  exerciseId: integer("exercise_id").notNull().references(() => exercisesTable.id, { onDelete: "restrict" }),
  metricType: text("metric_type").notNull(), // 1rm_kg | duration_sec | distance_m
  value: real("value").notNull(), // canonical value for this metric type
  // Supplementary fields preserved alongside the PR for display
  weightKg: real("weight_kg"),
  reps: integer("reps"),
  estimatedOneRepMax: real("estimated_one_rep_max"),
  durationSec: integer("duration_sec"),
  distanceM: real("distance_m"),
  sessionId: integer("session_id").references(() => workoutSessionsTable.id, { onDelete: "set null" }),
  achievedAt: timestamp("achieved_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("workout_prs_user_exercise_metric_idx").on(t.userId, t.exerciseId, t.metricType),
  index("workout_prs_user_id_idx").on(t.userId),
  index("workout_prs_exercise_id_idx").on(t.exerciseId),
]);

export const insertWorkoutPersonalRecordSchema = createInsertSchema(workoutPersonalRecordsTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial({
    weightKg: true,
    reps: true,
    estimatedOneRepMax: true,
    durationSec: true,
    distanceM: true,
    sessionId: true,
  });

export type InsertWorkoutPersonalRecord = z.infer<typeof insertWorkoutPersonalRecordSchema>;
export type WorkoutPersonalRecord = typeof workoutPersonalRecordsTable.$inferSelect;
