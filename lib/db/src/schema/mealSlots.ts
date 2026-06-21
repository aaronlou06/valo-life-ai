// One row per meal slot (breakfast/lunch/dinner/snack) within a day-type template.
// recipeName is the AI-generated dish name; instructions is optional cooking guidance.
import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const mealSlotsTable = pgTable("meal_slots", {
  id: serial("id").primaryKey(),
  dayTypeId: integer("day_type_id").notNull(),
  planId: integer("plan_id").notNull(),
  userId: text("user_id").notNull(),
  slotIndex: integer("slot_index").notNull(),
  slotName: text("slot_name").notNull(),
  recipeName: text("recipe_name").notNull(),
  instructions: text("instructions"),
  prepMode: text("prep_mode").notNull().default("cook"),
  targetCalories: integer("target_calories").notNull(),
  targetProteinG: integer("target_protein_g").notNull(),
  targetCarbsG: integer("target_carbs_g").notNull(),
  targetFatG: integer("target_fat_g").notNull(),
  actualCalories: integer("actual_calories").notNull(),
  actualProteinG: integer("actual_protein_g").notNull(),
  actualCarbsG: integer("actual_carbs_g").notNull(),
  actualFatG: integer("actual_fat_g").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("meal_slots_day_type_id_idx").on(t.dayTypeId),
  index("meal_slots_plan_id_idx").on(t.planId),
]);

export type MealSlot = typeof mealSlotsTable.$inferSelect;
export type InsertMealSlot = typeof mealSlotsTable.$inferInsert;
