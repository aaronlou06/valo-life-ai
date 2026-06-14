import { pgTable, serial, text, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workoutTemplatesTable } from "./workoutTemplates";
import { exercisesTable } from "./exercises";

// An exercise slot inside a template, with prescribed targets.
export const workoutTemplateExercisesTable = pgTable("workout_template_exercises", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => workoutTemplatesTable.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id").notNull().references(() => exercisesTable.id, { onDelete: "restrict" }),
  orderIndex: integer("order_index").notNull().default(0),
  prescribedSets: integer("prescribed_sets"),
  prescribedReps: integer("prescribed_reps"),
  prescribedDurationSec: integer("prescribed_duration_sec"),
  prescribedDistanceM: real("prescribed_distance_m"),
  prescribedWeightKg: real("prescribed_weight_kg"), // canonical kilograms
  restSec: integer("rest_sec").notNull().default(90),
  supersetGroupId: integer("superset_group_id"), // null = standalone; equal values = paired
  notes: text("notes"),
}, (t) => [
  index("workout_template_exercises_template_id_idx").on(t.templateId),
  index("workout_template_exercises_exercise_id_idx").on(t.exerciseId),
]);

export const insertWorkoutTemplateExerciseSchema = createInsertSchema(workoutTemplateExercisesTable)
  .omit({ id: true })
  .partial({
    orderIndex: true,
    prescribedSets: true,
    prescribedReps: true,
    prescribedDurationSec: true,
    prescribedDistanceM: true,
    prescribedWeightKg: true,
    restSec: true,
    supersetGroupId: true,
    notes: true,
  });

export type InsertWorkoutTemplateExercise = z.infer<typeof insertWorkoutTemplateExerciseSchema>;
export type WorkoutTemplateExercise = typeof workoutTemplateExercisesTable.$inferSelect;
