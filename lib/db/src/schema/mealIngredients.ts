// Per-serving ingredients for a meal slot. quantityPerServing is the single
// source of truth; batch quantities are derived (quantityPerServing × recurrence).
import { pgTable, serial, text, integer, real, timestamp, index } from "drizzle-orm/pg-core";

export const mealIngredientsTable = pgTable("meal_ingredients", {
  id: serial("id").primaryKey(),
  mealSlotId: integer("meal_slot_id").notNull(),
  planId: integer("plan_id").notNull(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  quantityPerServing: real("quantity_per_serving").notNull(),
  unit: text("unit").notNull(),
  caloriesPerServing: integer("calories_per_serving").notNull(),
  proteinG: real("protein_g").notNull(),
  carbsG: real("carbs_g").notNull(),
  fatG: real("fat_g").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("meal_ingredients_meal_slot_id_idx").on(t.mealSlotId),
  index("meal_ingredients_plan_id_idx").on(t.planId),
]);

export type MealIngredient = typeof mealIngredientsTable.$inferSelect;
export type InsertMealIngredient = typeof mealIngredientsTable.$inferInsert;
