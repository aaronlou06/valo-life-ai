import { pgTable, serial, text, integer, date, timestamp, jsonb } from "drizzle-orm/pg-core";

export const nutritionLogsTable = pgTable("nutrition_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: date("date").notNull(),
  mealType: text("meal_type").notNull(),
  description: text("description"),
  calories: integer("calories"),
  proteinG: integer("protein_g"),
  carbsG: integer("carbs_g"),
  fatG: integer("fat_g"),
  imageUrl: text("image_url"),
  source: text("source"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NutritionLog = typeof nutritionLogsTable.$inferSelect;
export type InsertNutritionLog = typeof nutritionLogsTable.$inferInsert;
