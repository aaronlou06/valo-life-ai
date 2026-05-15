import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const goalsTable = pgTable("goals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  targetDate: text("target_date"),
  progressPercent: integer("progress_percent").notNull().default(0),
  category: text("category").notNull().default("personal"),

  goalType: text("goal_type").notNull().default("milestone"),
  // 'milestone' | 'readiness' | 'measurement' | 'performance' | 'consistency' | 'quota' | 'avoidance' | 'leveling'

  currentValue: integer("current_value"),
  targetValue: integer("target_value"),
  unit: text("unit"),
  direction: text("direction").default("up"),
  // 'up' = trying to increase, 'down' = trying to decrease

  xpPoints: integer("xp_points").default(0),
  currentTier: text("current_tier"),
  tiers: text("tiers"),
  // JSON string array of tier names e.g. '["Beginner","Intermediate","Advanced"]'

  milestones: text("milestones"),
  // JSON string array e.g. '[{"id":1,"title":"Do X","completed":false}]'

  avoidanceLimit: integer("avoidance_limit"),
  // max occurrences allowed per week for avoidance goals

  linkedHabitIds: text("linked_habit_ids"),
  // JSON string array of habit IDs e.g. '[1,2,3]'

  notes: text("notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGoalSchema = createInsertSchema(goalsTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial({
    goalType: true,
    currentValue: true,
    targetValue: true,
    unit: true,
    direction: true,
    xpPoints: true,
    currentTier: true,
    tiers: true,
    milestones: true,
    avoidanceLimit: true,
    linkedHabitIds: true,
    notes: true,
  });

export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Goal = typeof goalsTable.$inferSelect;
