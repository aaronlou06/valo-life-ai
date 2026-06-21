// One row per day-type template (training | rest) within a plan.
import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const mealPlanDayTypesTable = pgTable("meal_plan_day_types", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull(),
  userId: text("user_id").notNull(),
  dayType: text("day_type").notNull(),
  targetCalories: integer("target_calories").notNull(),
  targetProteinG: integer("target_protein_g").notNull(),
  targetCarbsG: integer("target_carbs_g").notNull(),
  targetFatG: integer("target_fat_g").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("meal_plan_day_types_plan_id_idx").on(t.planId),
  index("meal_plan_day_types_user_id_idx").on(t.userId),
]);

export type MealPlanDayType = typeof mealPlanDayTypesTable.$inferSelect;
export type InsertMealPlanDayType = typeof mealPlanDayTypesTable.$inferInsert;
