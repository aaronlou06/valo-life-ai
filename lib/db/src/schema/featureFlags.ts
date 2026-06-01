import { pgTable, serial, text, boolean, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";

export const featureFlagsTable = pgTable("feature_flags", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  enabled: boolean("enabled").default(false).notNull(),
  rolloutPercent: numeric("rollout_percent").default("100"),
  allowedUserIds: text("allowed_user_ids").array(),
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FeatureFlag = typeof featureFlagsTable.$inferSelect;
export type InsertFeatureFlag = typeof featureFlagsTable.$inferInsert;
