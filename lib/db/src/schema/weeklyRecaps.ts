import { pgTable, serial, text, timestamp, real, integer, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const weeklyRecapsTable = pgTable("weekly_recaps", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  weekStart: text("week_start").notNull(), // YYYY-MM-DD (Monday)
  weekEnd: text("week_end").notNull(),     // YYYY-MM-DD (Sunday)
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),

  // 7-day aggregates
  avgMood: real("avg_mood"),
  avgSleep: real("avg_sleep"),
  avgHrv: real("avg_hrv"),
  avgSteps: real("avg_steps"),
  avgEnergy: real("avg_energy"),

  // Pillar scores (0-10)
  pillarSleep: real("pillar_sleep"),
  pillarMovement: real("pillar_movement"),
  pillarWork: real("pillar_work"),
  pillarMindset: real("pillar_mindset"),
  pillarRelationships: real("pillar_relationships"),

  // Activity counts
  workoutsCompleted: integer("workouts_completed").notNull().default(0),
  habitsCompletionPct: real("habits_completion_pct"),
  debriefCount: integer("debrief_count").notNull().default(0),
  nutritionDaysLogged: integer("nutrition_days_logged").notNull().default(0),

  // AI-generated fields
  headline: text("headline"),
  valoInsight: text("valo_insight"),
  narrativeJson: jsonb("narrative_json").$type<RecapNarrative>(),
  patternsSnapshot: jsonb("patterns_snapshot").$type<string[]>(),
  topWin: text("top_win"),
  topStruggle: text("top_struggle"),
  intentionNextWeek: text("intention_next_week"),

  isQuietWeek: boolean("is_quiet_week").notNull().default(false),
  status: text("status").notNull().default("draft"), // draft | ready
  modelUsed: text("model_used"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("weekly_recaps_user_week_idx").on(t.userId, t.weekStart),
]);

export interface RecapNarrativeSection {
  title: string;
  body: string;
  delta?: number | null;
}

export interface RecapNarrative {
  sections: RecapNarrativeSection[];
  closing?: string | null;
}

export const insertWeeklyRecapSchema = createInsertSchema(weeklyRecapsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWeeklyRecap = z.infer<typeof insertWeeklyRecapSchema>;
export type WeeklyRecap = typeof weeklyRecapsTable.$inferSelect;
