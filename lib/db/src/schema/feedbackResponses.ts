import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const feedbackResponsesTable = pgTable("feedback_responses", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  sessionId: text("session_id"),
  rating: integer("rating"),
  comment: text("comment"),
  context: text("context"),
  appVersion: text("app_version"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FeedbackResponse = typeof feedbackResponsesTable.$inferSelect;
export type InsertFeedbackResponse = typeof feedbackResponsesTable.$inferInsert;
