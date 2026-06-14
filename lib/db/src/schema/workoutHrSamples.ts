import { pgTable, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workoutSessionsTable } from "./workoutSessions";

// Time-series heart-rate samples captured during a session.
export const workoutHrSamplesTable = pgTable("workout_hr_samples", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => workoutSessionsTable.id, { onDelete: "cascade" }),
  bpm: integer("bpm").notNull(),
  sampledAt: timestamp("sampled_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("workout_hr_samples_session_sampled_idx").on(t.sessionId, t.sampledAt),
]);

export const insertWorkoutHrSampleSchema = createInsertSchema(workoutHrSamplesTable).omit({ id: true });

export type InsertWorkoutHrSample = z.infer<typeof insertWorkoutHrSampleSchema>;
export type WorkoutHrSample = typeof workoutHrSamplesTable.$inferSelect;
