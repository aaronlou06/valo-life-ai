import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A multi-week training block (e.g. "5/3/1 — 4-Week Block").
export const workoutProgramsTable = pgTable("workout_programs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  totalWeeks: integer("total_weeks").notNull().default(1),
  notes: text("notes"),
  // Set when user attaches the program to their calendar (YYYY-MM-DD).
  startDate: text("start_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("workout_programs_user_id_idx").on(t.userId),
]);

export const insertWorkoutProgramSchema = createInsertSchema(workoutProgramsTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial({ totalWeeks: true, notes: true, startDate: true });

export type InsertWorkoutProgram = z.infer<typeof insertWorkoutProgramSchema>;
export type WorkoutProgram = typeof workoutProgramsTable.$inferSelect;
