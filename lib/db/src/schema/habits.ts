import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const habitsTable = pgTable("habits", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  streak: integer("streak").notNull().default(0),
  completedToday: boolean("completed_today").notNull().default(false),
  lastCompletedDate: text("last_completed_date"),
  category: text("category").notNull().default("general"),

  type: text("type").notNull().default("good"),
  // 'good' = habit to build, 'bad' = habit to reduce

  targetFrequency: integer("target_frequency").default(7),
  // times per week, default daily

  longestStreak: integer("longest_streak").notNull().default(0),

  goalId: integer("goal_id"),
  // optional link to parent goal

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertHabitSchema = createInsertSchema(habitsTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial({
    type: true,
    targetFrequency: true,
    longestStreak: true,
    goalId: true,
  });

export type InsertHabit = z.infer<typeof insertHabitSchema>;
export type Habit = typeof habitsTable.$inferSelect;
