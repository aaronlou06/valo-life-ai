import { pgTable, serial, text, timestamp, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// trackingType drives which inputs the logger renders for an exercise:
//   weight_reps | bodyweight_reps | weighted_bodyweight |
//   reps_only | duration | distance_duration | cardio_machine
export const exercisesTable = pgTable("exercises", {
  id: serial("id").primaryKey(),
  userId: text("user_id"), // null = global/system exercise; set = user-created
  slug: text("slug"), // stable id from the seed dataset; null for custom exercises
  name: text("name").notNull(),
  trackingType: text("tracking_type").notNull().default("weight_reps"),
  category: text("category").notNull().default("strength"),
  equipment: text("equipment"),
  primaryMuscle: text("primary_muscle"),
  targetMuscles: jsonb("target_muscles").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  force: text("force"),
  mechanic: text("mechanic"),
  level: text("level"),
  isSystem: boolean("is_system").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("exercises_slug_idx").on(t.slug),
  index("exercises_user_id_idx").on(t.userId),
  index("exercises_category_idx").on(t.category),
]);

export const insertExerciseSchema = createInsertSchema(exercisesTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial({
    userId: true,
    slug: true,
    trackingType: true,
    category: true,
    equipment: true,
    primaryMuscle: true,
    targetMuscles: true,
    force: true,
    mechanic: true,
    level: true,
    isSystem: true,
    notes: true,
  });

export type InsertExercise = z.infer<typeof insertExerciseSchema>;
export type Exercise = typeof exercisesTable.$inferSelect;
