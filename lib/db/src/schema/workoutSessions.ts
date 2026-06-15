import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workoutTemplatesTable } from "./workoutTemplates";
import { workoutProgramsTable } from "./workoutPrograms";

// A logged instance of a workout. status drives session persistence.
export const workoutSessionsTable = pgTable("workout_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  templateId: integer("template_id").references(() => workoutTemplatesTable.id, { onDelete: "set null" }), // null = free-form
  programId: integer("program_id").references(() => workoutProgramsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("in_progress"), // in_progress | completed | abandoned
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationSec: integer("duration_sec"),
  perceivedEffort: integer("perceived_effort"), // 1-10
  notes: text("notes"),
  // Heart-rate summary — populated when a session finishes with captured HR data.
  avgHr: integer("avg_hr"),
  maxHr: integer("max_hr"),
  // Seconds spent in each HR zone, e.g. { rest: 30, z1: 120, z2: 300, ... }.
  timeInZone: jsonb("time_in_zone").$type<Record<string, number>>(),
  caloriesKcal: integer("calories_kcal"),
  calendarEventId: integer("calendar_event_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("workout_sessions_user_id_idx").on(t.userId),
  index("workout_sessions_user_status_idx").on(t.userId, t.status),
  index("workout_sessions_user_date_idx").on(t.userId, t.date),
]);

export const insertWorkoutSessionSchema = createInsertSchema(workoutSessionsTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial({
    templateId: true,
    programId: true,
    status: true,
    startedAt: true,
    completedAt: true,
    durationSec: true,
    perceivedEffort: true,
    notes: true,
    avgHr: true,
    maxHr: true,
    timeInZone: true,
    caloriesKcal: true,
  });

export type InsertWorkoutSession = z.infer<typeof insertWorkoutSessionSchema>;
export type WorkoutSession = typeof workoutSessionsTable.$inferSelect;
