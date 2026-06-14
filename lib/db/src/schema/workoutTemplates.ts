import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A reusable named workout (e.g. "Push Day — Upper Body").
export const workoutTemplatesTable = pgTable("workout_templates", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("strength"),
  // strength | cardio | hiit | mobility | sport
  estimatedDurationMin: integer("estimated_duration_min"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("workout_templates_user_id_idx").on(t.userId),
]);

export const insertWorkoutTemplateSchema = createInsertSchema(workoutTemplatesTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial({ category: true, estimatedDurationMin: true, notes: true });

export type InsertWorkoutTemplate = z.infer<typeof insertWorkoutTemplateSchema>;
export type WorkoutTemplate = typeof workoutTemplatesTable.$inferSelect;
