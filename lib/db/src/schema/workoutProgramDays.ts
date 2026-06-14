import { pgTable, serial, text, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workoutProgramsTable } from "./workoutPrograms";
import { workoutTemplatesTable } from "./workoutTemplates";

// Which template falls on which day of which week within a program.
export const workoutProgramDaysTable = pgTable("workout_program_days", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => workoutProgramsTable.id, { onDelete: "cascade" }),
  weekNumber: integer("week_number").notNull().default(1), // 1-based
  dayOfWeek: text("day_of_week").notNull(), // mon | tue | wed | thu | fri | sat | sun
  templateId: integer("template_id").references(() => workoutTemplatesTable.id, { onDelete: "set null" }), // null = rest day
  notes: text("notes"),
}, (t) => [
  uniqueIndex("workout_program_days_slot_idx").on(t.programId, t.weekNumber, t.dayOfWeek),
  index("workout_program_days_template_id_idx").on(t.templateId),
]);

export const insertWorkoutProgramDaySchema = createInsertSchema(workoutProgramDaysTable)
  .omit({ id: true })
  .partial({ weekNumber: true, templateId: true, notes: true });

export type InsertWorkoutProgramDay = z.infer<typeof insertWorkoutProgramDaySchema>;
export type WorkoutProgramDay = typeof workoutProgramDaysTable.$inferSelect;
