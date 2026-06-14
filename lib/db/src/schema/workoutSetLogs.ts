import { pgTable, serial, text, timestamp, integer, real, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workoutSessionsTable } from "./workoutSessions";
import { exercisesTable } from "./exercises";

// One logged set within a session. Weights/distances stored canonically.
export const workoutSetLogsTable = pgTable("workout_set_logs", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => workoutSessionsTable.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id").notNull().references(() => exercisesTable.id, { onDelete: "restrict" }),
  setNumber: integer("set_number").notNull().default(1), // 1-based per exercise in session
  weightKg: real("weight_kg"), // canonical kilograms
  reps: integer("reps"),
  durationSec: integer("duration_sec"),
  distanceM: real("distance_m"), // canonical meters
  rpe: integer("rpe"), // 1-10
  isWarmup: boolean("is_warmup").notNull().default(false),
  isPersonalBest: boolean("is_personal_best").notNull().default(false),
  notes: text("notes"),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("workout_set_logs_session_id_idx").on(t.sessionId),
  index("workout_set_logs_exercise_id_idx").on(t.exerciseId),
]);

export const insertWorkoutSetLogSchema = createInsertSchema(workoutSetLogsTable)
  .omit({ id: true })
  .partial({
    setNumber: true,
    weightKg: true,
    reps: true,
    durationSec: true,
    distanceM: true,
    rpe: true,
    isWarmup: true,
    isPersonalBest: true,
    notes: true,
    loggedAt: true,
  });

export type InsertWorkoutSetLog = z.infer<typeof insertWorkoutSetLogSchema>;
export type WorkoutSetLog = typeof workoutSetLogsTable.$inferSelect;
