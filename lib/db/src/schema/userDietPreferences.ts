// One row per user; upserted on every plan creation so the wizard pre-fills
// on repeat visits. Uses userId as a unique key (not a serial PK) for easy upsert.
import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const userDietPreferencesTable = pgTable("user_diet_preferences", {
  userId: text("user_id").primaryKey(),
  macroProfile: text("macro_profile"),
  cuisineStyle: text("cuisine_style"),
  allergies: jsonb("allergies").$type<string[]>().notNull().default([]),
  dislikes: text("dislikes"),
  mealsPerDay: integer("meals_per_day"),
  trainingDaysPerWeek: integer("training_days_per_week"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UserDietPreferences = typeof userDietPreferencesTable.$inferSelect;
export type InsertUserDietPreferences = typeof userDietPreferencesTable.$inferInsert;
