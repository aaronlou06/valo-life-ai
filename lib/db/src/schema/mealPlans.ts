// Schema landing zone: standard dev DB (no in-progress migration blocking).
// mealPlans is the top-level record for one generated meal plan per user session.
import { pgTable, serial, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const mealPlansTable = pgTable("meal_plans", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  macroProfile: text("macro_profile").notNull(),
  cuisineStyle: text("cuisine_style"),
  allergies: jsonb("allergies").$type<string[]>().notNull().default([]),
  dislikes: text("dislikes"),
  mealsPerDay: integer("meals_per_day").notNull().default(3),
  trainingDaysPerWeek: integer("training_days_per_week").notNull().default(3),
  restDaysPerWeek: integer("rest_days_per_week").notNull().default(4),
  dailyBaselineCalories: integer("daily_baseline_calories").notNull(),
  dailyProteinG: integer("daily_protein_g").notNull(),
  dailyCarbsG: integer("daily_carbs_g").notNull(),
  dailyFatG: integer("daily_fat_g").notNull(),
  inputsSnapshot: jsonb("inputs_snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("meal_plans_user_id_idx").on(t.userId),
]);

export type MealPlan = typeof mealPlansTable.$inferSelect;
export type InsertMealPlan = typeof mealPlansTable.$inferInsert;
