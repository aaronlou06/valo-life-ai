import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const habitCompletionsTable = pgTable("habit_completions", {
  id: serial("id").primaryKey(),
  habitId: integer("habit_id").notNull(),
  userId: text("user_id").notNull(),
  completionDate: text("completion_date").notNull(),
  completed: boolean("completed").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type HabitCompletion = typeof habitCompletionsTable.$inferSelect;
