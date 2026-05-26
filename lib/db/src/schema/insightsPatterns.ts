import { pgTable, serial, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const insightsPatternsTable = pgTable("insights_patterns", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  patternType: text("pattern_type").notNull(),
  metricA: text("metric_a").notNull(),
  metricB: text("metric_b").notNull(),
  correlationScore: real("correlation_score").notNull(),
  description: text("description").notNull(),
  discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertInsightPatternSchema = createInsertSchema(insightsPatternsTable).omit({
  id: true,
  discoveredAt: true,
});

export type InsertInsightPattern = z.infer<typeof insertInsightPatternSchema>;
export type InsightPattern = typeof insightsPatternsTable.$inferSelect;
